import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.services.neo4j.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)


class GraphBuilder:
    def __init__(
        self,
        neo4j_client: Neo4jClient,
        embedding_service=None,
    ):
        self.client = neo4j_client
        self.embedding_service = embedding_service

    def build_from_knowledge_graph(self, kg: Dict[str, Any], book_title: str = ""):
        logger.info(f"开始构建知识图谱，书名: {book_title}")

        entity_id_map = {}

        entity_creators = {
            "philosophers": self._create_philosopher_node,
            "concepts": self._create_concept_node,
            "theories": self._create_theory_node,
            "works": self._create_work_node,
            "arguments": self._create_argument_node,
            "schools": self._create_school_node,
            "eras": self._create_era_node,
        }

        for key, creator in entity_creators.items():
            for entity in kg.get(key, []):
                node_id = creator(entity, book_title)
                entity_id_map[entity.get("id") or entity.get("name")] = node_id

        if self.embedding_service:
            logger.info("生成实体嵌入向量...")
            all_entities = []
            for key in entity_creators:
                all_entities.extend(kg.get(key, []))

            texts = []
            for entity in all_entities:
                text = entity.get("name", "")
                if entity.get("description"):
                    text += f" {entity['description']}"
                texts.append(text)

            try:
                embeddings = self.embedding_service.embed_texts(texts)
                entity_types = [
                    "Philosopher", "Concept", "Theory", "Work", "Argument", "School", "Era",
                ]
                entity_lists = [
                    kg.get("philosophers", []),
                    kg.get("concepts", []),
                    kg.get("theories", []),
                    kg.get("works", []),
                    kg.get("arguments", []),
                    kg.get("schools", []),
                    kg.get("eras", []),
                ]

                embed_idx = 0
                for entity_list, label in zip(entity_lists, entity_types):
                    for entity in entity_list:
                        if embed_idx < len(embeddings):
                            self.client.store_embedding(entity.get("name", ""), label, embeddings[embed_idx])
                            embed_idx += 1

                logger.info(f"已存储 {embed_idx} 个实体的嵌入向量")
            except Exception as e:
                logger.error(f"生成嵌入向量失败: {e}")

        for relation in kg.get("relations", []):
            self._create_relationship(relation, entity_id_map)

        logger.info(
            f"知识图谱构建完成，共创建 {len(entity_id_map)} 个节点，{len(kg.get('relations', []))} 个关系"
        )

    def _create_philosopher_node(self, philosopher: Dict, book_title: str) -> str:
        query = """
        MERGE (p:Philosopher {name: $name})
        SET p.description = $description,
            p.birth_year = $birth_year,
            p.death_year = $death_year,
            p.nationality = $nationality,
            p.schools = $schools,
            p.source_text = $source_text,
            p.source_location = $source_location,
            p.confidence = $confidence,
            p.book_title = $book_title,
            p.created_at = datetime(),
            p.entity_type = 'Philosopher',
            p.embedding = $embedding
        RETURN id(p) as node_id
        """
        result = self.client.execute_write(query, {
            "name": philosopher.get("name", ""),
            "description": philosopher.get("description", ""),
            "birth_year": philosopher.get("birth_year"),
            "death_year": philosopher.get("death_year"),
            "nationality": philosopher.get("nationality"),
            "schools": philosopher.get("schools", []),
            "source_text": philosopher.get("source_text", ""),
            "source_location": philosopher.get("source_location", ""),
            "confidence": philosopher.get("confidence", 0.8),
            "book_title": book_title,
            "embedding": None,
        })
        return result[0]["node_id"] if result else None

    def _create_concept_node(self, concept: Dict, book_title: str) -> str:
        query = """
        MERGE (c:Concept {name: $name})
        SET c.description = $description,
            c.category = $category,
            c.definition = $definition,
            c.key_characteristics = $key_characteristics,
            c.examples = $examples,
            c.source_text = $source_text,
            c.source_location = $source_location,
            c.confidence = $confidence,
            c.book_title = $book_title,
            c.created_at = datetime(),
            c.entity_type = 'Concept',
            c.embedding = $embedding
        RETURN id(c) as node_id
        """
        result = self.client.execute_write(query, {
            "name": concept.get("name", ""),
            "description": concept.get("description", ""),
            "category": concept.get("category"),
            "definition": concept.get("definition", ""),
            "key_characteristics": concept.get("key_characteristics", []),
            "examples": concept.get("examples", []),
            "source_text": concept.get("source_text", ""),
            "source_location": concept.get("source_location", ""),
            "confidence": concept.get("confidence", 0.8),
            "book_title": book_title,
            "embedding": None,
        })
        return result[0]["node_id"] if result else None

    def _create_theory_node(self, theory: Dict, book_title: str) -> str:
        query = """
        MERGE (t:Theory {name: $name})
        SET t.description = $description,
            t.core_claims = $core_claims,
            t.scope = $scope,
            t.limitations = $limitations,
            t.source_text = $source_text,
            t.source_location = $source_location,
            t.confidence = $confidence,
            t.book_title = $book_title,
            t.created_at = datetime(),
            t.entity_type = 'Theory',
            t.embedding = $embedding
        RETURN id(t) as node_id
        """
        result = self.client.execute_write(query, {
            "name": theory.get("name", ""),
            "description": theory.get("description", ""),
            "core_claims": theory.get("core_claims", []),
            "scope": theory.get("scope"),
            "limitations": theory.get("limitations", []),
            "source_text": theory.get("source_text", ""),
            "source_location": theory.get("source_location", ""),
            "confidence": theory.get("confidence", 0.8),
            "book_title": book_title,
            "embedding": None,
        })
        return result[0]["node_id"] if result else None

    def _create_work_node(self, work: Dict, book_title: str) -> str:
        query = """
        MERGE (w:Work {name: $name})
        SET w.description = $description,
            w.author = $author,
            w.publication_year = $publication_year,
            w.work_type = $work_type,
            w.main_themes = $main_themes,
            w.source_text = $source_text,
            w.source_location = $source_location,
            w.confidence = $confidence,
            w.book_title = $book_title,
            w.created_at = datetime(),
            w.entity_type = 'Work',
            w.embedding = $embedding
        RETURN id(w) as node_id
        """
        result = self.client.execute_write(query, {
            "name": work.get("name", ""),
            "description": work.get("description", ""),
            "author": work.get("author"),
            "publication_year": work.get("publication_year"),
            "work_type": work.get("work_type"),
            "main_themes": work.get("main_themes", []),
            "source_text": work.get("source_text", ""),
            "source_location": work.get("source_location", ""),
            "confidence": work.get("confidence", 0.8),
            "book_title": book_title,
            "embedding": None,
        })
        return result[0]["node_id"] if result else None

    def _create_argument_node(self, argument: Dict, book_title: str) -> str:
        query = """
        MERGE (a:Argument {name: $name})
        SET a.description = $description,
            a.premises = $premises,
            a.conclusion = $conclusion,
            a.argument_type = $argument_type,
            a.validity = $validity,
            a.source_text = $source_text,
            a.source_location = $source_location,
            a.confidence = $confidence,
            a.book_title = $book_title,
            a.created_at = datetime(),
            a.entity_type = 'Argument',
            a.embedding = $embedding
        RETURN id(a) as node_id
        """
        result = self.client.execute_write(query, {
            "name": argument.get("name", ""),
            "description": argument.get("description", ""),
            "premises": argument.get("premises", []),
            "conclusion": argument.get("conclusion", ""),
            "argument_type": argument.get("argument_type"),
            "validity": argument.get("validity"),
            "source_text": argument.get("source_text", ""),
            "source_location": argument.get("source_location", ""),
            "confidence": argument.get("confidence", 0.8),
            "book_title": book_title,
            "embedding": None,
        })
        return result[0]["node_id"] if result else None

    def _create_school_node(self, school: Dict, book_title: str) -> str:
        query = """
        MERGE (s:School {name: $name})
        SET s.description = $description,
            s.era = $era,
            s.key_figures = $key_figures,
            s.core_doctrines = $core_doctrines,
            s.source_text = $source_text,
            s.source_location = $source_location,
            s.confidence = $confidence,
            s.book_title = $book_title,
            s.created_at = datetime(),
            s.entity_type = 'School',
            s.embedding = $embedding
        RETURN id(s) as node_id
        """
        result = self.client.execute_write(query, {
            "name": school.get("name", ""),
            "description": school.get("description", ""),
            "era": school.get("era"),
            "key_figures": school.get("key_figures", []),
            "core_doctrines": school.get("core_doctrines", []),
            "source_text": school.get("source_text", ""),
            "source_location": school.get("source_location", ""),
            "confidence": school.get("confidence", 0.8),
            "book_title": book_title,
            "embedding": None,
        })
        return result[0]["node_id"] if result else None

    def _create_era_node(self, era: Dict, book_title: str) -> str:
        query = """
        MERGE (e:Era {name: $name})
        SET e.description = $description,
            e.start_year = $start_year,
            e.end_year = $end_year,
            e.characteristics = $characteristics,
            e.source_text = $source_text,
            e.source_location = $source_location,
            e.confidence = $confidence,
            e.book_title = $book_title,
            e.created_at = datetime(),
            e.entity_type = 'Era',
            e.embedding = $embedding
        RETURN id(e) as node_id
        """
        result = self.client.execute_write(query, {
            "name": era.get("name", ""),
            "description": era.get("description", ""),
            "start_year": era.get("start_year"),
            "end_year": era.get("end_year"),
            "characteristics": era.get("characteristics", []),
            "source_text": era.get("source_text", ""),
            "source_location": era.get("source_location", ""),
            "confidence": era.get("confidence", 0.8),
            "book_title": book_title,
            "embedding": None,
        })
        return result[0]["node_id"] if result else None

    def _create_relationship(self, relation: Dict, entity_id_map: Dict[str, str]):
        source_id = entity_id_map.get(relation.get("source_id") or relation.get("source"))
        target_id = entity_id_map.get(relation.get("target_id") or relation.get("target"))

        if source_id is None or target_id is None:
            logger.warning(
                f"无法创建关系: 源或目标实体不存在 {relation.get('source_id', relation.get('source'))} -> {relation.get('target_id', relation.get('target'))}"
            )
            return

        relation_type = relation.get("relation_type", "RELATED_TO")
        query = f"""
        MATCH (source)
        WHERE id(source) = $source_id
        MATCH (target)
        WHERE id(target) = $target_id
        MERGE (source)-[r:{relation_type}]->(target)
        SET r.description = $description,
            r.strength = $strength,
            r.evidence = $evidence,
            r.confidence = $confidence,
            r.created_at = datetime()
        """

        try:
            self.client.execute_write(query, {
                "source_id": source_id,
                "target_id": target_id,
                "description": relation.get("description", ""),
                "strength": relation.get("strength", 1.0),
                "evidence": relation.get("evidence", ""),
                "confidence": relation.get("confidence", 0.8),
            })
        except Exception as e:
            logger.error(f"创建关系失败: {e}")
