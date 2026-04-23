import logging
from typing import List, Dict, Any, Optional

from app.services.neo4j.neo4j_client import Neo4jClient
from app.services.neo4j.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class QueryService:
    def __init__(
        self,
        neo4j_client: Optional[Neo4jClient] = None,
        embedding_service: Optional[EmbeddingService] = None,
    ):
        self.neo4j_client = neo4j_client
        self.embedding_service = embedding_service

    def search_entities(
        self, keyword: str, entity_type: Optional[str] = None, limit: int = 20
    ) -> List[Dict[str, Any]]:
        if entity_type:
            query = """
            MATCH (n:{entity_type})
            WHERE n.name CONTAINS $keyword OR n.description CONTAINS $keyword
            RETURN n.name as name, n.description as description,
                   labels(n) as labels, n.confidence as confidence
            LIMIT $limit
            """.format(entity_type=entity_type)
        else:
            query = """
            MATCH (n)
            WHERE n.name CONTAINS $keyword OR n.description CONTAINS $keyword
            RETURN n.name as name, n.description as description,
                   labels(n) as labels, n.confidence as confidence
            LIMIT $limit
            """
        try:
            return self.neo4j_client.execute_query(query, {"keyword": keyword, "limit": limit})
        except Exception as e:
            logger.error(f"搜索实体失败: {e}")
            return []

    def semantic_search(
        self, query: str, entity_type: Optional[str] = None, top_k: int = 10
    ) -> List[Dict[str, Any]]:
        if self.embedding_service is None:
            logger.warning("嵌入服务不可用，无法进行语义搜索")
            return []
        try:
            query_vector = self.embedding_service.embed_query(query)
        except Exception as e:
            logger.error(f"生成查询向量失败: {e}")
            return []

        if entity_type:
            index_name = f"{entity_type.lower()}_embeddings"
            results = self.neo4j_client.query_vector_index(index_name, query_vector, top_k)
        else:
            all_results = []
            entity_types = ["Philosopher", "Concept", "Theory", "Work", "Argument", "School", "Era"]
            per_type_k = max(top_k // len(entity_types), 3)
            for etype in entity_types:
                index_name = f"{etype.lower()}_embeddings"
                try:
                    type_results = self.neo4j_client.query_vector_index(index_name, query_vector, per_type_k)
                    all_results.extend(type_results)
                except Exception:
                    continue
            all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
            results = all_results[:top_k]
        return results

    def get_entity_details(self, entity_name: str) -> Optional[Dict[str, Any]]:
        query = """
        MATCH (n {name: $name})
        OPTIONAL MATCH (n)-[r]->(target)
        OPTIONAL MATCH (source)-[r2]->(n)
        RETURN n as entity, labels(n) as labels,
               collect(DISTINCT {relation: type(r), target: target.name, target_labels: labels(target), description: r.description}) as outgoing_relations,
               collect(DISTINCT {relation: type(r2), source: source.name, source_labels: labels(source), description: r2.description}) as incoming_relations
        """
        try:
            result = self.neo4j_client.execute_query(query, {"name": entity_name})
            if result:
                return result[0]
            return None
        except Exception as e:
            logger.error(f"获取实体详情失败: {e}")
            return None

    def get_concept_network(self, concept_name: str, depth: int = 2) -> Dict[str, Any]:
        query = """
        MATCH path = (c:Concept {name: $name})-[*1..{depth}]-(related)
        RETURN c as center, collect(DISTINCT related) as related_nodes,
               collect(DISTINCT relationships(path)) as relations
        """.format(depth=depth)
        try:
            result = self.neo4j_client.execute_query(query, {"name": concept_name})
            if result:
                return result[0]
            return {"center": None, "related_nodes": [], "relations": []}
        except Exception as e:
            logger.error(f"获取概念网络失败: {e}")
            return {"center": None, "related_nodes": [], "relations": []}

    def get_graph_data_for_book(self, book_title: str) -> Dict[str, Any]:
        query = """
        MATCH (n)
        WHERE (n.book_title = $book_title OR n.source_doc_title = $book_title)
          AND (n.name IS NOT NULL OR n.concept IS NOT NULL)
        WITH n
        OPTIONAL MATCH (n)-[r]->(m)
        WHERE (m.book_title = $book_title OR m.source_doc_title = $book_title)
          AND (m.name IS NOT NULL OR m.concept IS NOT NULL)
        RETURN collect(DISTINCT {
            id: id(n), 
            name: coalesce(n.name, n.concept, '未命名'), 
            labels: labels(n), 
            description: coalesce(n.description, n.definition, ''), 
            entity_type: n.entity_type, 
            concept: n.concept, 
            definition: n.definition, 
            node_type: n.node_type, 
            source_chapter_index: n.source_chapter_index,
            book_title: coalesce(n.book_title, n.source_doc_title, '')
        }) as nodes,
        collect(DISTINCT {
            source: id(n), 
            target: id(m), 
            type: type(r), 
            description: coalesce(r.description, '')
        }) as edges
        """
        try:
            result = self.neo4j_client.execute_query(query, {"book_title": book_title})
            if result:
                nodes = result[0].get("nodes", [])
                edges = result[0].get("edges", [])
                valid_edges = [e for e in edges if e.get("source") is not None and e.get("target") is not None]
                return {"nodes": nodes, "edges": valid_edges}
            return {"nodes": [], "edges": []}
        except Exception as e:
            logger.error(f"获取书籍图谱数据失败: {e}")
            return {"nodes": [], "edges": []}

    def get_all_graph_data(self) -> Dict[str, Any]:
        query = """
        MATCH (n)
        WHERE (n:Philosopher OR n:Concept OR n:Theory OR n:Work OR n:Argument OR n:School OR n:Era OR n:CognitiveNode)
          AND (n.name IS NOT NULL OR n.concept IS NOT NULL)
        WITH n
        OPTIONAL MATCH (n)-[r]->(m)
        WHERE (m:Philosopher OR m:Concept OR m:Theory OR m:Work OR m:Argument OR m:School OR m:Era OR m:CognitiveNode)
          AND (m.name IS NOT NULL OR m.concept IS NOT NULL)
        RETURN collect(DISTINCT {
            id: id(n), 
            name: coalesce(n.name, n.concept, '未命名'), 
            labels: labels(n), 
            description: coalesce(n.description, n.definition, ''), 
            entity_type: n.entity_type, 
            book_title: coalesce(n.book_title, n.source_doc_title, ''), 
            concept: n.concept, 
            definition: n.definition, 
            node_type: n.node_type, 
            source_chapter_index: n.source_chapter_index
        }) as nodes,
        collect(DISTINCT {
            source: id(n), 
            target: id(m), 
            type: type(r), 
            description: coalesce(r.description, '')
        }) as edges
        """
        try:
            result = self.neo4j_client.execute_query(query, {})
            if result:
                nodes = result[0].get("nodes", [])
                edges = result[0].get("edges", [])
                valid_edges = [e for e in edges if e.get("source") is not None and e.get("target") is not None]
                return {"nodes": nodes, "edges": valid_edges}
            return {"nodes": [], "edges": []}
        except Exception as e:
            logger.error(f"获取全部图谱数据失败: {e}")
            return {"nodes": [], "edges": []}

    def get_statistics(self) -> Dict[str, Any]:
        queries = {
            "total_nodes": "MATCH (n) RETURN count(n) as count",
            "total_relations": "MATCH ()-[r]->() RETURN count(r) as count",
            "books": "MATCH (b:Book) RETURN count(b) as count",
            "philosophers": "MATCH (p:Philosopher) RETURN count(p) as count",
            "concepts": "MATCH (c:Concept) RETURN count(c) as count",
            "theories": "MATCH (t:Theory) RETURN count(t) as count",
            "works": "MATCH (w:Work) RETURN count(w) as count",
            "arguments": "MATCH (a:Argument) RETURN count(a) as count",
            "top_concepts": """
                MATCH (c:Concept)<-[r]-()
                RETURN c.name as name, count(r) as connections
                ORDER BY connections DESC LIMIT 10
            """,
            "top_philosophers": """
                MATCH (p:Philosopher)<-[r]-()
                RETURN p.name as name, count(r) as connections
                ORDER BY connections DESC LIMIT 10
            """,
        }
        stats = {}
        for key, query in queries.items():
            try:
                result = self.neo4j_client.execute_query(query)
                stats[key] = result
            except Exception as e:
                logger.error(f"获取统计信息失败 {key}: {e}")
                stats[key] = []
        return stats

    def get_book_entities(self, book_title: str) -> Dict[str, List[Dict[str, Any]]]:
        entity_types = ["Philosopher", "Concept", "Theory", "Work", "Argument", "School", "Era"]
        result = {}
        for entity_type in entity_types:
            query = f"""
            MATCH (n:{entity_type} {{book_title: $book_title}})
            RETURN n.name as name, n.description as description, n.confidence as confidence
            ORDER BY n.confidence DESC
            """
            try:
                entities = self.neo4j_client.execute_query(query, {"book_title": book_title})
                result[entity_type.lower() + "s"] = entities
            except Exception as e:
                logger.error(f"获取书籍实体失败 {entity_type}: {e}")
                result[entity_type.lower() + "s"] = []
        return result
