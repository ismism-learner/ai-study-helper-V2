import logging
import uuid
import json
from typing import List, Optional, Dict, Any, AsyncGenerator
from datetime import datetime

from app.config import settings_manager
from app.services.neo4j.neo4j_client import Neo4jClient
from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)


class CognitiveChainService:
    def __init__(self, neo4j_client: Neo4jClient):
        self.neo4j_client = neo4j_client
        self._explanation_cache: Dict[str, tuple] = {}
        self._cache_ttl = 300

    async def create_chain(
        self,
        root_concept: str,
        context: str = "",
        user_id: Optional[str] = None,
        source_doc_id: Optional[str] = None,
        source_doc_title: Optional[str] = None,
        source_chapter_index: Optional[int] = None,
    ) -> Dict[str, Any]:
        chain_id = str(uuid.uuid4())

        full_context = root_concept
        if context:
            full_context = root_concept + "\n\n参考内容：\n" + context

        explanation = await self._generate_concept_explanation(root_concept, full_context)
        label = explanation.get("label", root_concept[:15])

        root_node = {
            "id": str(uuid.uuid4()),
            "concept": label,
            "definition": explanation.get("definition", ""),
            "node_type": "RootConcept",
            "domain": explanation.get("domain", "通用"),
            "understanding_level": "unknown",
            "confidence": explanation.get("confidence", 0.8),
            "chain_id": chain_id,
            "source_doc_id": source_doc_id,
            "source_doc_title": source_doc_title,
            "source_chapter_index": source_chapter_index,
            "created_at": datetime.now().isoformat(),
        }

        chain = {
            "id": chain_id,
            "title": f"认知链: {label}",
            "root_concept": root_concept,
            "root_node_id": root_node["id"],
            "nodes": [root_node],
            "edges": [],
            "depth": 0,
            "total_nodes": 1,
            "total_edges": 0,
            "domains": [root_node["domain"]] if root_node["domain"] else [],
            "user_id": user_id,
            "source_doc_id": source_doc_id,
            "source_doc_title": source_doc_title,
            "created_at": datetime.now().isoformat(),
        }

        self._store_chain_to_neo4j(chain)
        logger.info(f"创建认知链: {chain_id}, 根概念: {root_concept}, 标签: {label}")
        return chain

    async def expand_chain(
        self,
        chain_id: str,
        parent_node_id: str,
        concept_to_explain: str,
        context: str = "",
        source_doc_id: Optional[str] = None,
        source_doc_title: Optional[str] = None,
        source_chapter_index: Optional[int] = None,
    ) -> Dict[str, Any]:
        chain = self.get_chain(chain_id)
        if not chain:
            raise ValueError(f"认知链不存在: {chain_id}")

        explanation = await self._generate_concept_explanation(concept_to_explain, context)
        label = explanation.get("label", concept_to_explain[:15])

        new_node = {
            "id": str(uuid.uuid4()),
            "concept": label,
            "definition": explanation.get("definition", ""),
            "node_type": "DerivedConcept",
            "domain": explanation.get("domain", "通用"),
            "understanding_level": "unknown",
            "confidence": explanation.get("confidence", 0.8),
            "chain_id": chain_id,
            "source_doc_id": source_doc_id,
            "source_doc_title": source_doc_title,
            "source_chapter_index": source_chapter_index,
            "created_at": datetime.now().isoformat(),
        }

        edge = {
            "id": str(uuid.uuid4()),
            "source_id": parent_node_id,
            "target_id": new_node["id"],
            "relation_type": "EXPLAINS",
            "description": f"解释概念: {concept_to_explain}",
            "context": context,
            "is_dashed": False,
            "is_cross_doc": False,
        }

        chain["nodes"].append(new_node)
        chain["edges"].append(edge)
        chain["total_nodes"] = len(chain["nodes"])
        chain["total_edges"] = len(chain["edges"])

        self._store_node_to_neo4j(new_node, chain_id)
        self._store_edge_to_neo4j(edge, chain_id)

        logger.info(f"扩展认知链: {chain_id}, 新概念: {label}")
        return new_node

    async def explain_concept(self, concept: str, context: str = "") -> Dict[str, Any]:
        kg_entity = self._query_knowledge_graph(concept)
        if kg_entity:
            logger.info(f"从知识图谱获取概念: {concept}")
            return {
                "label": concept[:15],
                "concept": concept,
                "definition": kg_entity.get("description", ""),
                "domain": kg_entity.get("domain", "通用"),
                "key_concepts": [],
                "suggested_questions": [],
                "confidence": kg_entity.get("confidence", 0.9),
                "source": "knowledge_graph",
            }

        logger.info(f"AI 生成概念解释: {concept}")
        return await self._generate_concept_explanation(concept, context)

    def get_chain(self, chain_id: str) -> Optional[Dict[str, Any]]:
        query = """
        MATCH (chain:CognitiveChain {id: $chain_id})
        OPTIONAL MATCH (chain)-[:HAS_NODE]->(node:CognitiveNode)
        WITH chain, collect(DISTINCT node) as unordered_nodes
        UNWIND unordered_nodes AS n
        WITH chain, n ORDER BY n.created_at ASC
        WITH chain, collect(n) as nodes
        OPTIONAL MATCH (source:CognitiveNode)-[edge:EXPLAINS|REQUIRES|RELATES_TO|BELONGS_TO]->(target:CognitiveNode)
        WHERE source.chain_id = $chain_id AND target.chain_id = $chain_id
        WITH chain, nodes, collect(DISTINCT {
            id: edge.id, source_id: source.id, target_id: target.id,
            relation_type: type(edge), description: edge.description,
            context: edge.context, is_dashed: edge.is_dashed, is_cross_doc: edge.is_cross_doc
        }) as edges
        RETURN chain, nodes, edges
        """
        try:
            result = self.neo4j_client.execute_query(query, {"chain_id": chain_id})
            if result and result[0]:
                return self._reconstruct_chain(result[0])
            return None
        except Exception as e:
            logger.error(f"获取认知链失败: {e}")
            return None

    def get_user_chains(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        query = """
        MATCH (chain:CognitiveChain {user_id: $user_id})
        RETURN chain
        ORDER BY chain.created_at DESC
        LIMIT $limit
        """
        try:
            results = self.neo4j_client.execute_query(
                query, {"user_id": user_id, "limit": limit}
            )
            return [
                self._reconstruct_chain({"chain": r["chain"], "nodes": [], "edges": []})
                for r in results
            ]
        except Exception as e:
            logger.error(f"获取用户认知链失败: {e}")
            return []

    def get_chains_by_source_doc(self, source_doc_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        query = """
        MATCH (chain:CognitiveChain)
        WHERE chain.source_doc_id = $source_doc_id
        OPTIONAL MATCH (chain)-[:HAS_NODE]->(rootNode:CognitiveNode {node_type: 'RootConcept'})
        RETURN chain, rootNode
        ORDER BY chain.created_at DESC
        LIMIT $limit
        """
        try:
            results = self.neo4j_client.execute_query(
                query, {"source_doc_id": source_doc_id, "limit": limit}
            )
            chains = []
            for r in results:
                chain_data = self._reconstruct_chain({"chain": r["chain"], "nodes": [], "edges": []})
                root_node = r.get("rootNode")
                if root_node:
                    chain_data["root_concept_label"] = root_node.get("concept", "")
                    chain_data["root_definition"] = root_node.get("definition", "")[:100] + "..." if root_node.get("definition") and len(root_node.get("definition", "")) > 100 else root_node.get("definition", "")
                chains.append(chain_data)
            return chains
        except Exception as e:
            logger.error(f"获取书籍认知链失败: {e}")
            return []

    def delete_chain(self, chain_id: str) -> bool:
        query = """
        MATCH (chain:CognitiveChain {id: $chain_id})
        OPTIONAL MATCH (chain)-[:HAS_NODE]->(node:CognitiveNode)
        OPTIONAL MATCH (node)-[edge]->(other:CognitiveNode)
        WHERE other.chain_id = $chain_id
        DETACH DELETE node
        WITH chain
        DELETE chain
        """
        try:
            self.neo4j_client.execute_write(query, {"chain_id": chain_id})
            logger.info(f"删除认知链: {chain_id}")
            return True
        except Exception as e:
            logger.error(f"删除认知链失败: {e}")
            return False

    async def _generate_concept_explanation(
        self, concept: str, context: str = ""
    ) -> Dict[str, Any]:
        context_section = ""
        if context:
            context_section = f"\n上下文：{context}"

        prompt = f"""请解释以下概念：
概念：{concept}
{context_section}"""

        try:
            content = await ai_service.generate_text(
                prompt=prompt,
                system_prompt=settings_manager.kg_concept_prompt,
                max_tokens=1024,
            )

            json_str = self._extract_json(content)
            data = json.loads(json_str)

            return {
                "label": data.get("label", concept[:15]),
                "concept": concept,
                "definition": data.get("definition", ""),
                "domain": data.get("domain", "通用"),
                "key_concepts": data.get("key_concepts", []),
                "suggested_questions": data.get("suggested_questions", []),
                "confidence": 0.8,
                "source": "ai_generated",
            }
        except json.JSONDecodeError as e:
            logger.warning(f"JSON解析失败，尝试从文本提取: {e}")
            return {
                "label": concept[:15],
                "concept": concept,
                "definition": content if content else f"无法生成 '{concept}' 的解释",
                "domain": "通用",
                "key_concepts": [],
                "suggested_questions": [],
                "confidence": 0.5,
                "source": "ai_generated",
            }
        except Exception as e:
            logger.error(f"AI 生成解释失败: {e}")
            return {
                "label": concept[:15],
                "concept": concept,
                "definition": f"无法生成 '{concept}' 的解释",
                "domain": "未知",
                "key_concepts": [],
                "suggested_questions": [],
                "confidence": 0.0,
                "source": "ai_generated",
            }

    def _query_knowledge_graph(self, concept: str) -> Optional[Dict[str, Any]]:
        query = """
        MATCH (n)
        WHERE (n:Philosopher OR n:Concept OR n:Theory OR n:Work OR n:Argument OR n:School OR n:Era OR n:CognitiveNode)
          AND (n.name = $concept OR n.name CONTAINS $concept OR n.concept CONTAINS $concept)
        RETURN n.name as name, n.concept as n_concept, n.description as description, n.definition as definition, 
               labels(n) as labels, n.confidence as confidence, id(n) as id, n.category as domain, n.domain as n_domain
        LIMIT 1
        """
        try:
            result = self.neo4j_client.execute_query(query, {"concept": concept})
            if result:
                entity = result[0]
                return {
                    "id": entity.get("id"),
                    "name": entity.get("name") or entity.get("n_concept"),
                    "description": entity.get("description") or entity.get("definition", ""),
                    "type": entity.get("labels", [])[0]
                    if entity.get("labels")
                    else None,
                    "domain": entity.get("domain") or entity.get("n_domain", "通用"),
                    "confidence": entity.get("confidence", 0.9),
                }
            return None
        except Exception as e:
            logger.error(f"查询知识图谱失败: {e}")
            return None

    def _extract_json(self, content: str) -> str:
        if "```json" in content:
            start = content.find("```json") + 7
            end = content.find("```", start)
            return content[start:end].strip()
        elif "```" in content:
            start = content.find("```") + 3
            end = content.find("```", start)
            return content[start:end].strip()
        else:
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1:
                return content[start : end + 1]
            return "{}"

    def _store_chain_to_neo4j(self, chain: Dict[str, Any]):
        query = """
        MERGE (chain:CognitiveChain {id: $id})
        SET chain.title = $title, chain.root_concept = $root_concept,
            chain.depth = $depth, chain.total_nodes = $total_nodes,
            chain.total_edges = $total_edges, chain.domains = $domains,
            chain.user_id = $user_id, chain.source_doc_id = $source_doc_id,
            chain.source_doc_title = $source_doc_title,
            chain.created_at = datetime(),
            chain.updated_at = datetime(), chain.is_active = true
        """
        self.neo4j_client.execute_write(
            query,
            {
                "id": chain["id"],
                "title": chain.get("title", ""),
                "root_concept": chain.get("root_concept", ""),
                "depth": chain.get("depth", 0),
                "total_nodes": chain.get("total_nodes", len(chain.get("nodes", []))),
                "total_edges": chain.get("total_edges", len(chain.get("edges", []))),
                "domains": chain.get("domains", []),
                "user_id": chain.get("user_id"),
                "source_doc_id": chain.get("source_doc_id"),
                "source_doc_title": chain.get("source_doc_title"),
            },
        )

        if chain.get("nodes"):
            nodes_data = []
            for node in chain["nodes"]:
                nodes_data.append(
                    {
                        "id": node.get("id"),
                        "concept": node.get("concept", ""),
                        "definition": node.get("definition", ""),
                        "node_type": node.get("node_type", "DerivedConcept"),
                        "domain": node.get("domain"),
                        "understanding_level": node.get(
                            "understanding_level", "unknown"
                        ),
                        "confidence": node.get("confidence", 0.8),
                        "chain_id": chain["id"],
                        "source_doc_id": node.get("source_doc_id"),
                        "source_doc_title": node.get("source_doc_title"),
                        "source_chapter_index": node.get("source_chapter_index"),
                    }
                )

            batch_query = """
            UNWIND $nodes AS n
            MERGE (node:CognitiveNode {id: n.id})
            ON CREATE SET node.created_at = datetime()
            SET node.concept = n.concept, node.definition = n.definition,
                node.node_type = n.node_type, node.domain = n.domain,
                node.understanding_level = n.understanding_level,
                node.confidence = n.confidence, node.chain_id = n.chain_id,
                node.source_doc_id = n.source_doc_id,
                node.source_doc_title = n.source_doc_title,
                node.source_chapter_index = n.source_chapter_index,
                node.updated_at = datetime()
            WITH node, n
            MATCH (c:CognitiveChain {id: n.chain_id})
            MERGE (c)-[:HAS_NODE]->(node)
            """
            self.neo4j_client.execute_write(batch_query, {"nodes": nodes_data})

        for edge in chain.get("edges", []):
            self._store_edge_to_neo4j(edge, chain["id"])

    def _store_node_to_neo4j(self, node: Dict[str, Any], chain_id: str):
        query = """
        MERGE (node:CognitiveNode {id: $id})
        ON CREATE SET node.created_at = datetime()
        SET node.concept = $concept, node.definition = $definition,
            node.node_type = $node_type, node.domain = $domain,
            node.understanding_level = $understanding_level,
            node.confidence = $confidence, node.chain_id = $chain_id,
            node.source_doc_id = $source_doc_id,
            node.source_doc_title = $source_doc_title,
            node.source_chapter_index = $source_chapter_index,
            node.updated_at = datetime()
        WITH node
        MATCH (chain:CognitiveChain {id: $chain_id})
        MERGE (chain)-[:HAS_NODE]->(node)
        """
        self.neo4j_client.execute_write(
            query,
            {
                "id": node["id"],
                "concept": node.get("concept", ""),
                "definition": node.get("definition", ""),
                "node_type": node.get("node_type", "DerivedConcept"),
                "domain": node.get("domain"),
                "understanding_level": node.get("understanding_level", "unknown"),
                "confidence": node.get("confidence", 0.8),
                "chain_id": chain_id,
                "source_doc_id": node.get("source_doc_id"),
                "source_doc_title": node.get("source_doc_title"),
                "source_chapter_index": node.get("source_chapter_index"),
            },
        )

    def _store_edge_to_neo4j(self, edge: Dict[str, Any], chain_id: str):
        relation_type = edge.get("relation_type", "EXPLAINS")
        query = f"""
        MATCH (source:CognitiveNode {{id: $source_id}})
        MATCH (target:CognitiveNode {{id: $target_id}})
        MERGE (source)-[r:{relation_type}]->(target)
        SET r.id = $id, r.description = $description, r.context = $context,
            r.is_dashed = $is_dashed, r.is_cross_doc = $is_cross_doc, r.created_at = datetime()
        """
        self.neo4j_client.execute_write(
            query,
            {
                "id": edge.get("id"),
                "source_id": edge.get("source_id", ""),
                "target_id": edge.get("target_id", ""),
                "description": edge.get("description", ""),
                "context": edge.get("context", ""),
                "is_dashed": edge.get("is_dashed", False),
                "is_cross_doc": edge.get("is_cross_doc", False),
            },
        )

    def _reconstruct_chain(self, data: Dict[str, Any]) -> Dict[str, Any]:
        chain_data = data.get("chain", {})

        nodes = []
        for node_data in data.get("nodes", []):
            if node_data:
                nodes.append(
                    {
                        "id": node_data.get("id"),
                        "concept": node_data.get("concept", ""),
                        "definition": node_data.get("definition", ""),
                        "node_type": node_data.get("node_type", "DerivedConcept"),
                        "domain": node_data.get("domain"),
                        "understanding_level": node_data.get(
                            "understanding_level", "unknown"
                        ),
                        "confidence": node_data.get("confidence", 0.8),
                        "chain_id": node_data.get("chain_id"),
                        "source_doc_id": node_data.get("source_doc_id"),
                        "source_doc_title": node_data.get("source_doc_title"),
                    }
                )

        edges = []
        for edge_data in data.get("edges", []):
            if edge_data and edge_data.get("id") is not None:
                edges.append(
                    {
                        "id": edge_data.get("id"),
                        "source_id": edge_data.get("source_id", ""),
                        "target_id": edge_data.get("target_id", ""),
                        "relation_type": edge_data.get("relation_type", "EXPLAINS"),
                        "description": edge_data.get("description", ""),
                        "context": edge_data.get("context", ""),
                        "is_dashed": edge_data.get("is_dashed") or False,
                        "is_cross_doc": edge_data.get("is_cross_doc") or False,
                    }
                )

        root_node_id = None
        for node in nodes:
            if node.get("node_type") == "RootConcept":
                root_node_id = node.get("id")
                break

        return {
            "id": chain_data.get("id"),
            "title": chain_data.get("title", ""),
            "root_concept": chain_data.get("root_concept", ""),
            "root_node_id": root_node_id,
            "nodes": nodes,
            "edges": edges,
            "depth": chain_data.get("depth", 0),
            "total_nodes": chain_data.get("total_nodes", len(nodes)),
            "total_edges": chain_data.get("total_edges", len(edges)),
            "domains": chain_data.get("domains", []) or [],
            "user_id": chain_data.get("user_id"),
        }
