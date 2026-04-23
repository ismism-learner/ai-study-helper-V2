import logging
from typing import List, Dict, Any, Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class Neo4jClient:
    def __init__(
        self,
        uri: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
    ):
        self.uri = uri or "bolt://localhost:7687"
        self.user = user or "neo4j"
        self.password = password or "password"
        self._driver = None

    def connect(self):
        if self._driver is None:
            try:
                from neo4j import GraphDatabase

                self._driver = GraphDatabase.driver(
                    self.uri, auth=(self.user, self.password)
                )
                self._driver.verify_connectivity()
                logger.info(f"成功连接到 Neo4j 数据库: {self.uri}")
            except ImportError:
                raise ImportError(
                    "neo4j 包未安装，请运行: pip install neo4j"
                )
            except Exception as e:
                logger.error(f"连接 Neo4j 失败: {e}")
                raise
        return self._driver

    def close(self):
        if self._driver:
            self._driver.close()
            self._driver = None
            logger.info("Neo4j 连接已关闭")

    @contextmanager
    def session(self):
        driver = self.connect()
        session = driver.session()
        try:
            yield session
        finally:
            session.close()

    def execute_query(
        self, query: str, parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        parameters = parameters or {}
        with self.session() as session:
            result = session.run(query, parameters)
            return [record.data() for record in result]

    def execute_write(
        self, query: str, parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        parameters = parameters or {}
        with self.session() as session:
            result = session.execute_write(lambda tx: tx.run(query, parameters).data())
            return result

    def create_constraints(self):
        from app.config import settings_manager

        dimension = settings_manager.embedding_dimension

        constraints = [
            "CREATE CONSTRAINT philosopher_name IF NOT EXISTS FOR (p:Philosopher) REQUIRE p.name IS UNIQUE",
            "CREATE CONSTRAINT concept_name IF NOT EXISTS FOR (c:Concept) REQUIRE c.name IS UNIQUE",
            "CREATE CONSTRAINT theory_name IF NOT EXISTS FOR (t:Theory) REQUIRE t.name IS UNIQUE",
            "CREATE CONSTRAINT work_name IF NOT EXISTS FOR (w:Work) REQUIRE w.name IS UNIQUE",
            "CREATE CONSTRAINT school_name IF NOT EXISTS FOR (s:School) REQUIRE s.name IS UNIQUE",
            "CREATE CONSTRAINT era_name IF NOT EXISTS FOR (e:Era) REQUIRE e.name IS UNIQUE",
            "CREATE CONSTRAINT cognitive_chain_id IF NOT EXISTS FOR (c:CognitiveChain) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT cognitive_node_id IF NOT EXISTS FOR (n:CognitiveNode) REQUIRE n.id IS UNIQUE",
            "CREATE INDEX philosopher_era IF NOT EXISTS FOR (p:Philosopher) ON (p.era)",
            "CREATE INDEX concept_category IF NOT EXISTS FOR (c:Concept) ON (c.category)",
            "CREATE INDEX entity_source IF NOT EXISTS FOR (n:Entity) ON (n.source_text)",
            "CREATE INDEX cognitive_node_chain_id IF NOT EXISTS FOR (n:CognitiveNode) ON (n.chain_id)",
            "CREATE INDEX cognitive_node_type IF NOT EXISTS FOR (n:CognitiveNode) ON (n.node_type)",
            "CREATE INDEX cognitive_node_doc_id IF NOT EXISTS FOR (n:CognitiveNode) ON (n.source_doc_id)",
        ]

        with self.session() as session:
            for constraint in constraints:
                try:
                    session.run(constraint)
                    logger.info(f"创建约束/索引: {constraint[:50]}...")
                except Exception as e:
                    logger.warning(f"创建约束失败（可能已存在）: {e}")

        self.create_vector_indexes(dimension)

    def create_vector_indexes(self, dimension: int = 1024):
        entity_labels = [
            "Philosopher", "Concept", "Theory", "Work", "Argument", "School", "Era",
        ]

        for label in entity_labels:
            index_name = f"{label.lower()}_embeddings"
            query = f"""
            CREATE VECTOR INDEX {index_name} IF NOT EXISTS
            FOR (n:{label}) ON (n.embedding)
            OPTIONS {{indexConfig: {{
                `vector.dimensions`: {dimension},
                `vector.similarity_function`: 'cosine'
            }}}}
            """
            try:
                with self.session() as session:
                    session.run(query)
                    logger.info(f"创建向量索引: {index_name}")
            except Exception as e:
                logger.warning(f"创建向量索引失败（可能已存在）: {e}")

    def store_embedding(self, entity_name: str, label: str, embedding: List[float]) -> bool:
        query = f"""
        MATCH (n:{label} {{name: $name}})
        SET n.embedding = $embedding
        """
        try:
            self.execute_write(query, {"name": entity_name, "embedding": embedding})
            return True
        except Exception as e:
            logger.error(f"存储嵌入向量失败: {e}")
            return False

    def store_embeddings_batch(self, entities: List[Dict[str, Any]]) -> int:
        success_count = 0
        for entity in entities:
            if self.store_embedding(entity["name"], entity["label"], entity["embedding"]):
                success_count += 1
        return success_count

    def query_vector_index(
        self, index_name: str, query_vector: List[float], top_k: int = 10
    ) -> List[Dict[str, Any]]:
        query = """
        CALL db.index.vector.queryNodes($index_name, $top_k, $query_vector)
        YIELD node, score
        RETURN node.name as name,
               node.description as description,
               labels(node) as labels,
               node.entity_type as entity_type,
               score
        """
        try:
            return self.execute_query(
                query,
                {"index_name": index_name, "top_k": top_k, "query_vector": query_vector},
            )
        except Exception as e:
            logger.error(f"向量检索失败: {e}")
            return []

    def clear_database(self, confirm: bool = False):
        if not confirm:
            logger.warning("清空数据库操作需要 confirm=True 参数")
            return
        with self.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
            logger.info("数据库已清空")

    def get_stats(self) -> Dict[str, Any]:
        queries = {
            "total_nodes": "MATCH (n) RETURN count(n) as count",
            "total_relationships": "MATCH ()-[r]->() RETURN count(r) as count",
            "nodes_by_label": "MATCH (n) RETURN labels(n) as label, count(*) as count",
            "relationships_by_type": "MATCH ()-[r]->() RETURN type(r) as type, count(*) as count",
        }
        stats = {}
        for key, query in queries.items():
            try:
                result = self.execute_query(query)
                stats[key] = result
            except Exception as e:
                logger.error(f"获取统计信息失败 {key}: {e}")
                stats[key] = []
        return stats

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
