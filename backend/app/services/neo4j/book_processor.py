import logging
from typing import Optional, List, Dict, Any

from app.services.neo4j.neo4j_client import Neo4jClient
from app.services.neo4j.text_analyzer import PhilosophyTextAnalyzer
from app.services.neo4j.graph_builder import GraphBuilder
from app.services.neo4j.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class BookProcessor:
    def __init__(
        self,
        neo4j_client: Optional[Neo4jClient] = None,
        analyzer: Optional[PhilosophyTextAnalyzer] = None,
        embedding_service: Optional[EmbeddingService] = None,
    ):
        self.neo4j_client = neo4j_client
        self.analyzer = analyzer
        self.graph_builder = GraphBuilder(neo4j_client) if neo4j_client else None
        self.embedding_service = embedding_service

    def process_book(
        self,
        text: str,
        title: str,
        author: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> Dict[str, Any]:
        logger.info(f"开始处理书籍: {title}")

        logger.info("步骤 1/3: AI 分析文本，提取知识图谱...")
        knowledge_graph = self.analyzer.analyze_text(text)

        logger.info("步骤 2/3: 将知识图谱存入 Neo4j...")
        self.graph_builder.build_from_knowledge_graph(knowledge_graph, title)

        logger.info("步骤 3/3: 存储书籍元数据...")
        self._store_book_metadata(title, author, metadata, knowledge_graph)

        entity_count = sum(
            len(knowledge_graph.get(k, []))
            for k in ["philosophers", "concepts", "theories", "works", "arguments", "schools", "eras"]
        )
        relation_count = len(knowledge_graph.get("relations", []))

        logger.info(f"书籍处理完成: {title}，共提取 {entity_count} 个实体，{relation_count} 个关系")
        return knowledge_graph

    def _store_book_metadata(
        self, title: str, author: Optional[str], metadata: Optional[dict], knowledge_graph: Dict[str, Any]
    ):
        entity_count = sum(
            len(knowledge_graph.get(k, []))
            for k in ["philosophers", "concepts", "theories", "works", "arguments", "schools", "eras"]
        )
        relation_count = len(knowledge_graph.get("relations", []))

        query = """
        MERGE (b:Book {title: $title})
        SET b.author = $author,
            b.processed_at = datetime(),
            b.entity_count = $entity_count,
            b.relation_count = $relation_count,
            b.metadata = $metadata
        RETURN b
        """
        try:
            self.neo4j_client.execute_write(query, {
                "title": title,
                "author": author or "Unknown",
                "entity_count": entity_count,
                "relation_count": relation_count,
                "metadata": str(metadata or {}),
            })
            logger.info(f"书籍元数据已存储: {title}")
        except Exception as e:
            logger.error(f"存储书籍元数据失败: {e}")

    def get_processing_status(self, title: str) -> dict:
        query = """
        MATCH (b:Book {title: $title})
        RETURN b.title as title, b.author as author,
               b.processed_at as processed_at,
               b.entity_count as entity_count,
               b.relation_count as relation_count
        """
        try:
            result = self.neo4j_client.execute_query(query, {"title": title})
            if result:
                return result[0]
            return {"status": "not_found"}
        except Exception as e:
            logger.error(f"获取处理状态失败: {e}")
            return {"status": "error", "message": str(e)}

    def list_processed_books(self) -> List[dict]:
        query = """
        MATCH (b:Book)
        RETURN b.title as title, b.author as author,
               b.processed_at as processed_at,
               b.entity_count as entity_count,
               b.relation_count as relation_count
        ORDER BY b.processed_at DESC
        """
        try:
            return self.neo4j_client.execute_query(query)
        except Exception as e:
            logger.error(f"获取书籍列表失败: {e}")
            return []
