import logging
import json
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models import (
    CognitiveChain,
    CognitiveNode,
    BookDocument,
    KnowledgeNode,
    KnowledgeEdge,
)
from app.services.ai_service import ai_service
from app.config import settings_manager

logger = logging.getLogger(__name__)


def _utcnow():
    return datetime.now(timezone.utc)


class CognitiveChainService:
    def __init__(self, db: Session):
        self.db = db

    def _sync_to_knowledge_graph(
        self,
        concept: str,
        definition: str,
        node_type: str,
        domain: str,
        book_id: str = None,
        book_title: str = None,
        chapter_index: int = None,
        parent_knowledge_node_id: str = None,
    ) -> Optional[KnowledgeNode]:
        existing = (
            self.db.query(KnowledgeNode).filter(KnowledgeNode.name == concept).first()
        )
        if existing:
            logger.info(f"知识图谱节点已存在: {concept}, 类型: {existing.node_type}")
            if parent_knowledge_node_id and parent_knowledge_node_id != existing.id:
                parent_node = (
                    self.db.query(KnowledgeNode)
                    .filter(KnowledgeNode.id == parent_knowledge_node_id)
                    .first()
                )
                if existing.node_type == "QuickSummary":
                    logger.warning(f"跳过创建边: 目标节点 '{concept}' 是 QuickSummary，不允许被 EXPLAINS 边连接")
                    return existing
                edge_exists = (
                    self.db.query(KnowledgeEdge)
                    .filter(
                        KnowledgeEdge.source_id == parent_knowledge_node_id,
                        KnowledgeEdge.target_id == existing.id,
                    )
                    .first()
                )
                if not edge_exists:
                    edge = KnowledgeEdge(
                        source_id=parent_knowledge_node_id,
                        target_id=existing.id,
                        relation_type="EXPLAINS",
                        edge_type="EXPLAINS",
                        description=f"解释概念",
                        book_id=book_id,
                    )
                    self.db.add(edge)
                    logger.info(f"创建边: {parent_node.name if parent_node else parent_knowledge_node_id} --[EXPLAINS]--> {concept}")
            return existing

        knowledge_node = KnowledgeNode(
            name=concept,
            description=definition,
            entity_type=node_type,
            domain=domain,
            confidence=0.8,
            book_id=book_id,
            book_title=book_title,
            chapter_index=chapter_index,
        )
        self.db.add(knowledge_node)
        self.db.flush()

        if parent_knowledge_node_id:
            edge = KnowledgeEdge(
                source_id=parent_knowledge_node_id,
                target_id=knowledge_node.id,
                relation_type="EXPLAINS",
                edge_type="EXPLAINS",
                description=f"解释概念",
                book_id=book_id,
            )
            self.db.add(edge)
            parent_node = (
                self.db.query(KnowledgeNode)
                .filter(KnowledgeNode.id == parent_knowledge_node_id)
                .first()
            )
            logger.info(f"创建边: {parent_node.name if parent_node else parent_knowledge_node_id} --[EXPLAINS]--> {concept}")

        logger.info(f"同步到知识图谱: {concept}, 类型: {node_type}")
        return knowledge_node

    async def create_chain(
        self,
        root_concept: str,
        context: str = "",
        user_id: str = None,
        book_id: str = None,
        book_title: str = None,
        chapter_index: int = None,
        source_knowledge_node_id: str = None,
    ) -> Dict[str, Any]:
        full_context = root_concept
        if context:
            full_context = root_concept + "\n\n参考内容：\n" + context

        explanation = await self._generate_concept_explanation(
            root_concept, full_context
        )
        label = explanation.get("label", root_concept[:15])

        chain = CognitiveChain(
            title=f"认知链: {label}",
            root_concept=root_concept,
            book_id=book_id,
            book_title=book_title,
            total_nodes=1,
            total_edges=0,
            domains=[explanation.get("domain", "通用")]
            if explanation.get("domain")
            else [],
        )
        self.db.add(chain)
        self.db.flush()

        root_node = CognitiveNode(
            chain_id=chain.id,
            concept=label,
            definition=explanation.get("definition", ""),
            node_type="RootConcept",
            domain=explanation.get("domain", "通用"),
            confidence=explanation.get("confidence", 0.8),
            book_id=book_id,
            book_title=book_title,
            chapter_index=chapter_index,
        )
        self.db.add(root_node)
        self.db.flush()

        self._sync_to_knowledge_graph(
            concept=label,
            definition=explanation.get("definition", ""),
            node_type="RootConcept",
            domain=explanation.get("domain", "通用"),
            book_id=book_id,
            book_title=book_title,
            chapter_index=chapter_index,
            parent_knowledge_node_id=source_knowledge_node_id,
        )

        self.db.commit()
        self.db.refresh(chain)

        logger.info(f"创建认知链: {chain.id}, 根概念: {root_concept}")
        return self._chain_to_dict(chain)

    async def expand_chain(
        self,
        chain_id: str,
        parent_node_id: str,
        concept_to_explain: str,
        context: str = "",
        book_id: str = None,
        book_title: str = None,
        chapter_index: int = None,
        source_knowledge_node_id: str = None,
    ) -> Dict[str, Any]:
        chain = self.get_chain(chain_id)
        if not chain:
            raise ValueError(f"认知链不存在: {chain_id}")

        # 确定父知识节点ID：优先用直接传入的，否则通过概念名匹配
        parent_knowledge_node_id = source_knowledge_node_id
        if not parent_knowledge_node_id:
            parent_cognitive_node = (
                self.db.query(CognitiveNode)
                .filter(CognitiveNode.id == parent_node_id)
                .first()
            )
            if parent_cognitive_node:
                parent_kg_node = (
                    self.db.query(KnowledgeNode)
                    .filter(KnowledgeNode.name == parent_cognitive_node.concept)
                    .first()
                )
                if parent_kg_node:
                    parent_knowledge_node_id = parent_kg_node.id

        explanation = await self._generate_concept_explanation(
            concept_to_explain, context
        )
        label = explanation.get("label", concept_to_explain[:15])

        new_node = CognitiveNode(
            chain_id=chain_id,
            concept=label,
            definition=explanation.get("definition", ""),
            node_type="DerivedConcept",
            domain=explanation.get("domain", "通用"),
            confidence=explanation.get("confidence", 0.8),
            parent_node_id=parent_node_id,
            book_id=book_id,
            book_title=book_title,
            chapter_index=chapter_index,
        )
        self.db.add(new_node)
        self.db.flush()

        self._sync_to_knowledge_graph(
            concept=label,
            definition=explanation.get("definition", ""),
            node_type="DerivedConcept",
            domain=explanation.get("domain", "通用"),
            book_id=book_id,
            book_title=book_title,
            chapter_index=chapter_index,
            parent_knowledge_node_id=parent_knowledge_node_id,
        )

        chain.total_nodes = chain.total_nodes + 1
        chain.total_edges = chain.total_edges + 1
        self.db.commit()
        self.db.refresh(new_node)

        logger.info(f"扩展认知链: {chain_id}, 新概念: {label}")
        return self._node_to_dict(new_node)

    async def explain_concept(self, concept: str, context: str = "") -> Dict[str, Any]:
        return await self._generate_concept_explanation(concept, context)

    def get_chain(self, chain_id: str) -> Optional[CognitiveChain]:
        return (
            self.db.query(CognitiveChain).filter(CognitiveChain.id == chain_id).first()
        )

    def get_chain_dict(self, chain_id: str) -> Optional[Dict[str, Any]]:
        chain = self.get_chain(chain_id)
        if not chain:
            return None
        return self._chain_to_dict(chain)

    def get_chains_by_book(self, book_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        chains = (
            self.db.query(CognitiveChain)
            .filter(CognitiveChain.book_id == book_id)
            .order_by(CognitiveChain.created_at.desc())
            .limit(limit)
            .all()
        )
        return [self._chain_to_dict(c, include_nodes=False) for c in chains]

    def get_chain_by_knowledge_node(
        self, knowledge_node_id: str
    ) -> Optional[Dict[str, Any]]:
        cognitive_node = (
            self.db.query(CognitiveNode)
            .filter(CognitiveNode.knowledge_node_id == knowledge_node_id)
            .first()
        )
        if not cognitive_node:
            return None
        chain_dict = self.get_chain_dict(cognitive_node.chain_id)
        if not chain_dict:
            return None
        chain_dict["matched_cognitive_node_id"] = cognitive_node.id
        return chain_dict

    def find_chains_by_concept(
        self, concept_name: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """按概念名查找包含该概念的认知链（用于知识图谱实体跳转）"""
        nodes = (
            self.db.query(CognitiveNode)
            .filter(CognitiveNode.concept == concept_name)
            .order_by(CognitiveNode.created_at.desc())
            .limit(limit)
            .all()
        )
        seen_chain_ids = set()
        chains = []
        for node in nodes:
            if node.chain_id not in seen_chain_ids:
                seen_chain_ids.add(node.chain_id)
                chain = self.get_chain(node.chain_id)
                if chain:
                    chains.append(self._chain_to_dict(chain, include_nodes=False))
        return chains

    def get_user_chains(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        chains = (
            self.db.query(CognitiveChain)
            .order_by(CognitiveChain.created_at.desc())
            .limit(limit)
            .all()
        )
        return [self._chain_to_dict(c, include_nodes=False) for c in chains]

    def delete_chain(self, chain_id: str) -> bool:
        chain = self.get_chain(chain_id)
        if not chain:
            return False

        self.db.query(CognitiveNode).filter(CognitiveNode.chain_id == chain_id).delete()
        self.db.delete(chain)
        self.db.commit()
        return True

    async def _generate_concept_explanation(
        self, concept: str, context: str = ""
    ) -> Dict[str, Any]:
        concept_user_prompt_template = settings_manager.kg_concept_user_prompt
        if context:
            prompt = concept_user_prompt_template.format(
                concept=concept, context_section=f"\n上下文：\n{context}"
            )
        else:
            prompt = concept_user_prompt_template.format(
                concept=concept, context_section=""
            )

        try:
            content = await ai_service.generate_text(
                prompt=prompt,
                system_prompt=settings_manager.kg_concept_prompt,
                max_tokens=4096,
            )

            logger.info(f"AI返回内容: {content[:500] if content else '空'}")

            json_str = self._extract_json(content)
            logger.info(f"提取的JSON: {json_str[:500] if json_str else '空'}")

            data = json.loads(json_str)
            logger.info(f"解析后的数据: {data}")

            label = data.get("label", "")
            if not label or len(label) < 2:
                label = concept[:8] if len(concept) > 8 else concept

            definition = data.get("definition", "")
            if not definition:
                definition = content if content else f"无法生成 '{concept}' 的解释"

            return {
                "label": label,
                "concept": concept,
                "definition": definition,
                "domain": data.get("domain", "通用"),
                "key_concepts": data.get("key_concepts", []),
                "suggested_questions": data.get("suggested_questions", []),
                "confidence": 0.8,
                "source": "ai_generated",
            }
        except json.JSONDecodeError as e:
            logger.warning(f"JSON解析失败，尝试从文本提取: {e}")
            label = concept[:8] if len(concept) > 8 else concept
            return {
                "label": label,
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
            label = concept[:8] if len(concept) > 8 else concept
            return {
                "label": label,
                "concept": concept,
                "definition": f"无法生成 '{concept}' 的解释",
                "domain": "未知",
                "key_concepts": [],
                "suggested_questions": [],
                "confidence": 0.0,
                "source": "ai_generated",
            }

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

    def _chain_to_dict(
        self, chain: CognitiveChain, include_nodes: bool = True
    ) -> Dict[str, Any]:
        result = {
            "id": chain.id,
            "title": chain.title,
            "root_concept": chain.root_concept,
            "book_id": chain.book_id,
            "book_title": chain.book_title,
            "total_nodes": chain.total_nodes,
            "total_edges": chain.total_edges,
            "domains": chain.domains or [],
            "created_at": chain.created_at.isoformat() if chain.created_at else None,
        }

        if include_nodes:
            nodes = (
                self.db.query(CognitiveNode)
                .filter(CognitiveNode.chain_id == chain.id)
                .order_by(CognitiveNode.created_at)
                .all()
            )
            result["nodes"] = [self._node_to_dict(n) for n in nodes]
            result["edges"] = self._build_edges(nodes)
            result["root_node_id"] = nodes[0].id if nodes else None

        return result

    def _node_to_dict(self, node: CognitiveNode) -> Dict[str, Any]:
        return {
            "id": node.id,
            "chain_id": node.chain_id,
            "concept": node.concept,
            "definition": node.definition,
            "node_type": node.node_type,
            "domain": node.domain,
            "confidence": node.confidence,
            "understanding_level": node.understanding_level,
            "parent_node_id": node.parent_node_id,
            "book_id": node.book_id,
            "book_title": node.book_title,
            "chapter_index": node.chapter_index,
            "created_at": node.created_at.isoformat() if node.created_at else None,
        }

    def _build_edges(self, nodes: List[CognitiveNode]) -> List[Dict[str, Any]]:
        edges = []
        for node in nodes:
            if node.parent_node_id:
                edges.append(
                    {
                        "id": f"edge-{node.id}",
                        "source_id": node.parent_node_id,
                        "target_id": node.id,
                        "relation_type": "EXPLAINS",
                        "description": f"解释概念: {node.concept}",
                    }
                )
        return edges
