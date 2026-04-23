from app.services.neo4j.neo4j_client import Neo4jClient
from app.services.neo4j.graph_builder import GraphBuilder
from app.services.neo4j.embedding_service import EmbeddingService
from app.services.neo4j.text_analyzer import PhilosophyTextAnalyzer
from app.services.neo4j.book_processor import BookProcessor
from app.services.neo4j.query_service import QueryService
from app.services.neo4j.cognitive_chain_service import CognitiveChainService

neo4j_client: Neo4jClient | None = None
book_processor: BookProcessor | None = None
query_service: QueryService | None = None
embedding_service: EmbeddingService | None = None
cognitive_chain_service: CognitiveChainService | None = None


def init_neo4j_services(max_retries: int = 3, retry_delay: float = 5.0):
    global \
        neo4j_client, \
        book_processor, \
        query_service, \
        embedding_service, \
        cognitive_chain_service

    import time
    from app.config import settings_manager

    if not settings_manager.neo4j_enabled:
        print("[Neo4j] 知识图谱功能未启用 (neo4j_enabled=False)")
        return

    for attempt in range(1, max_retries + 1):
        try:
            neo4j_client = Neo4jClient(
                uri=settings_manager.neo4j_uri,
                user=settings_manager.neo4j_user,
                password=settings_manager.neo4j_password,
            )
            neo4j_client.connect()
            neo4j_client.create_constraints()
            print(f"[Neo4j] 成功连接到 Neo4j: {settings_manager.neo4j_uri}")
            break
        except Exception as e:
            print(f"[Neo4j] 连接失败 (尝试 {attempt}/{max_retries}): {e}")
            neo4j_client = None
            if attempt < max_retries:
                print(f"[Neo4j] {retry_delay}秒后重试...")
                time.sleep(retry_delay)
            else:
                print("[Neo4j] 已达到最大重试次数，放弃连接")
                return

    if settings_manager.embedding_enabled:
        try:
            print("[Neo4j] 正在加载嵌入模型 (BGE-M3)...")
            embedding_service = EmbeddingService.get_instance()
            embedding_service._load_model()
            print(f"[Neo4j] 嵌入模型加载完成: {embedding_service}")
        except Exception as e:
            print(f"[Neo4j] 嵌入模型加载失败，语义搜索不可用: {e}")
            embedding_service = None
    else:
        print("[Neo4j] 嵌入服务已禁用 (embedding_enabled=False)")
        embedding_service = None

    try:
        analyzer = PhilosophyTextAnalyzer()
        book_processor = BookProcessor(neo4j_client, analyzer, embedding_service)
        query_service = QueryService(neo4j_client, embedding_service)
        cognitive_chain_service = CognitiveChainService(neo4j_client)
        print("[Neo4j] 服务初始化完成")
    except Exception as e:
        print(f"[Neo4j] 服务初始化失败: {e}")


def ensure_neo4j_connection():
    """如果 neo4j_client 为 None 但设置中 neo4j_enabled 为 True，尝试重新连接。"""
    global neo4j_client
    if neo4j_client is not None:
        return True
    from app.config import settings_manager

    if not settings_manager.neo4j_enabled:
        return False
    print("[Neo4j] 检测到连接丢失，尝试重新初始化...")
    init_neo4j_services(max_retries=1, retry_delay=0)
    return neo4j_client is not None


def cleanup_neo4j_services():
    global neo4j_client, embedding_service

    if embedding_service:
        embedding_service.unload()
        print("[Neo4j] 嵌入模型已卸载")
    if neo4j_client:
        neo4j_client.close()
        print("[Neo4j] 连接已关闭")
