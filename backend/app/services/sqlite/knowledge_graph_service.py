import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models import KnowledgeNode, KnowledgeEdge, BookDocument
from app.services.ai_service import ai_service
from app.config import settings_manager

logger = logging.getLogger(__name__)


def _utcnow():
    return datetime.now(timezone.utc)


class KnowledgeGraphService:
    def __init__(self, db: Session):
        self.db = db

    def create_node(
        self,
        name: str,
        description: str = "",
        entity_type: str = "Concept",
        domain: str = None,
        confidence: float = 0.8,
        book_id: str = None,
        book_title: str = None,
        chapter_index: int = None,
        node_type: str = "DetailedQuestion",
        text_position: int = None,
        parent_summary_id: str = None,
        extra_data: dict = None,
    ) -> KnowledgeNode:
        node = KnowledgeNode(
            name=name,
            description=description,
            entity_type=entity_type,
            domain=domain,
            confidence=confidence,
            book_id=book_id,
            book_title=book_title,
            chapter_index=chapter_index,
            node_type=node_type,
            text_position=text_position,
            parent_summary_id=parent_summary_id,
            extra_data=extra_data,
        )
        self.db.add(node)
        self.db.commit()
        self.db.refresh(node)
        
        if node_type == "QuickSummary" and text_position is not None:
            self._update_nodes_parent_summary(book_id, text_position, node.id, chapter_index)
        
        if node_type == "QuickSummary":
            self._connect_orphan_detailed_questions(book_id, chapter_index, node.id)
        
        return node

    def _update_nodes_parent_summary(self, book_id: str, new_summary_position: int, new_summary_id: str, new_chapter_index: int = None):
        prev_summary = (
            self.db.query(KnowledgeNode)
            .filter(
                KnowledgeNode.book_id == book_id,
                KnowledgeNode.node_type == "QuickSummary",
                KnowledgeNode.text_position < new_summary_position,
            )
            .order_by(KnowledgeNode.text_position.desc())
            .first()
        )
        
        next_summary = (
            self.db.query(KnowledgeNode)
            .filter(
                KnowledgeNode.book_id == book_id,
                KnowledgeNode.node_type == "QuickSummary",
                KnowledgeNode.text_position > new_summary_position,
            )
            .order_by(KnowledgeNode.text_position.asc())
            .first()
        )
        
        if prev_summary:
            nodes_before_new = (
                self.db.query(KnowledgeNode)
                .filter(
                    KnowledgeNode.book_id == book_id,
                    KnowledgeNode.node_type == "DetailedQuestion",
                    KnowledgeNode.text_position >= prev_summary.text_position,
                    KnowledgeNode.text_position < new_summary_position,
                )
                .all()
            )
            for node in nodes_before_new:
                node.parent_summary_id = prev_summary.id
            
            if next_summary:
                nodes_after_new = (
                    self.db.query(KnowledgeNode)
                    .filter(
                        KnowledgeNode.book_id == book_id,
                        KnowledgeNode.node_type == "DetailedQuestion",
                        KnowledgeNode.text_position >= new_summary_position,
                        KnowledgeNode.text_position < next_summary.text_position,
                    )
                    .all()
                )
                for node in nodes_after_new:
                    if node.parent_summary_id == prev_summary.id:
                        node.parent_summary_id = new_summary_id
                        self.db.query(KnowledgeEdge).filter(
                            KnowledgeEdge.source_id == prev_summary.id,
                            KnowledgeEdge.target_id == node.id,
                        ).delete()
                        self.create_edge(
                            source_id=new_summary_id,
                            target_id=node.id,
                            relation_type="HAS_QUESTION",
                            edge_type="BRANCH_EXTEND",
                        )
                        logger.info(f"[QuickSummary] Reassigned DetailedQuestion: {node.name} from {prev_summary.name} to new summary")
            
            logger.info(f"[QuickSummary] prev_summary: {prev_summary.name}, chapter_index={prev_summary.chapter_index}")
            logger.info(f"[QuickSummary] new_summary: position={new_summary_position}, chapter_index={new_chapter_index}")
            
            is_same_chapter = False
            if new_chapter_index is not None and prev_summary.chapter_index is not None:
                is_same_chapter = (new_chapter_index == prev_summary.chapter_index)
            
            logger.info(f"[QuickSummary] is_same_chapter={is_same_chapter}")
            
            edge_type_to_use = "SECTION_SEQUENCE" if is_same_chapter else "CHAPTER_SEQUENCE"
            
            if next_summary:
                self.db.query(KnowledgeEdge).filter(
                    KnowledgeEdge.source_id == prev_summary.id,
                    KnowledgeEdge.target_id == next_summary.id,
                ).delete()
            
            self.create_edge(
                source_id=prev_summary.id,
                target_id=new_summary_id,
                relation_type=edge_type_to_use,
                edge_type=edge_type_to_use,
            )
            
            if next_summary:
                next_is_same_chapter = False
                if new_chapter_index is not None and next_summary.chapter_index is not None:
                    next_is_same_chapter = (new_chapter_index == next_summary.chapter_index)
                
                next_edge_type = "SECTION_SEQUENCE" if next_is_same_chapter else "CHAPTER_SEQUENCE"
                self.create_edge(
                    source_id=new_summary_id,
                    target_id=next_summary.id,
                    relation_type=next_edge_type,
                    edge_type=next_edge_type,
                )
        else:
            if next_summary:
                logger.info(f"[QuickSummary] No prev_summary, connecting to next: {next_summary.name}")
                self.create_edge(
                    source_id=new_summary_id,
                    target_id=next_summary.id,
                    relation_type="CHAPTER_SEQUENCE",
                    edge_type="CHAPTER_SEQUENCE",
                )
        
        self.db.commit()

    def _connect_orphan_detailed_questions(self, book_id: str, chapter_index: int, new_summary_id: str):
        if chapter_index is None:
            return
        
        orphan_nodes = (
            self.db.query(KnowledgeNode)
            .filter(
                KnowledgeNode.book_id == book_id,
                KnowledgeNode.node_type == "DetailedQuestion",
                KnowledgeNode.chapter_index == chapter_index,
                KnowledgeNode.parent_summary_id == None,
            )
            .all()
        )
        
        for node in orphan_nodes:
            node.parent_summary_id = new_summary_id
            existing_edge = (
                self.db.query(KnowledgeEdge)
                .filter(
                    KnowledgeEdge.source_id == new_summary_id,
                    KnowledgeEdge.target_id == node.id,
                )
                .first()
            )
            if not existing_edge:
                self.create_edge(
                    source_id=new_summary_id,
                    target_id=node.id,
                    relation_type="HAS_QUESTION",
                    edge_type="BRANCH_EXTEND",
                )
                logger.info(f"[QuickSummary] Connected orphan DetailedQuestion: {node.name} -> {new_summary_id}")
        
        self.db.commit()

    def get_node(self, node_id: str) -> Optional[KnowledgeNode]:
        return self.db.query(KnowledgeNode).filter(KnowledgeNode.id == node_id).first()

    def get_node_by_name(self, name: str) -> Optional[KnowledgeNode]:
        return self.db.query(KnowledgeNode).filter(KnowledgeNode.name == name).first()

    def search_nodes(
        self, keyword: str, entity_type: str = None, limit: int = 20
    ) -> List[KnowledgeNode]:
        query = self.db.query(KnowledgeNode).filter(
            KnowledgeNode.name.contains(keyword)
        )
        if entity_type:
            query = query.filter(KnowledgeNode.entity_type == entity_type)
        return query.limit(limit).all()

    def create_edge(
        self,
        source_id: str,
        target_id: str,
        relation_type: str = "RELATES_TO",
        edge_type: str = "BRANCH_EXTEND",
        description: str = None,
        weight: float = 1.0,
        book_id: str = None,
    ) -> Optional[KnowledgeEdge]:
        source = self.get_node(source_id)
        target = self.get_node(target_id)
        if not source or not target:
            return None

        edge = KnowledgeEdge(
            source_id=source_id,
            target_id=target_id,
            relation_type=relation_type,
            edge_type=edge_type,
            description=description,
            weight=weight,
            book_id=book_id,
        )
        self.db.add(edge)
        self.db.commit()
        self.db.refresh(edge)
        return edge

    def get_graph_data(self, book_title: str = None) -> Dict[str, Any]:
        if book_title:
            nodes = (
                self.db.query(KnowledgeNode)
                .filter(
                    or_(
                        KnowledgeNode.book_title == book_title,
                        KnowledgeNode.book_title == None,
                    )
                )
                .all()
            )
            node_ids = [n.id for n in nodes]
            edges = (
                self.db.query(KnowledgeEdge)
                .filter(
                    KnowledgeEdge.source_id.in_(node_ids),
                    KnowledgeEdge.target_id.in_(node_ids)
                )
                .all()
            )
        else:
            nodes = self.db.query(KnowledgeNode).all()
            edges = self.db.query(KnowledgeEdge).all()

        return {
            "nodes": [
                {
                    "id": n.id,
                    "name": n.name,
                    "description": n.description,
                    "entity_type": n.entity_type,
                    "domain": n.domain,
                    "confidence": n.confidence,
                    "book_title": n.book_title,
                    "chapter_index": n.chapter_index,
                    "node_type": n.node_type,
                    "text_position": n.text_position,
                    "parent_summary_id": n.parent_summary_id,
                    "labels": [n.entity_type],
                }
                for n in nodes
            ],
            "edges": [
                {
                    "source": e.source_id,
                    "target": e.target_id,
                    "type": e.relation_type,
                    "edge_type": e.edge_type,
                    "description": e.description,
                }
                for e in edges
                if e.source_id in [n.id for n in nodes] and e.target_id in [n.id for n in nodes]
            ],
        }

    def get_graph_data_by_tag(self, tag: str) -> Dict[str, Any]:
        from app.models import BookDocument

        books = (
            self.db.query(BookDocument)
            .filter(BookDocument.tags.contains(f'"{tag}"'))
            .all()
        )

        book_ids = [b.id for b in books]
        book_titles = [b.title for b in books]

        if not book_ids:
            return {"nodes": [], "edges": [], "books": []}

        nodes = (
            self.db.query(KnowledgeNode)
            .filter(KnowledgeNode.book_id.in_(book_ids))
            .all()
        )

        node_ids = [n.id for n in nodes]
        edges = (
            self.db.query(KnowledgeEdge)
            .filter(
                KnowledgeEdge.source_id.in_(node_ids),
                KnowledgeEdge.target_id.in_(node_ids)
            )
            .all()
        )

        book_info_map = {b.id: {"title": b.title, "cover": b.cover_image} for b in books}

        return {
            "nodes": [
                {
                    "id": n.id,
                    "name": n.name,
                    "description": n.description,
                    "entity_type": n.entity_type,
                    "domain": n.domain,
                    "confidence": n.confidence,
                    "book_id": n.book_id,
                    "book_title": n.book_title,
                    "chapter_index": n.chapter_index,
                    "node_type": n.node_type,
                    "text_position": n.text_position,
                    "parent_summary_id": n.parent_summary_id,
                    "labels": [n.entity_type],
                }
                for n in nodes
            ],
            "edges": [
                {
                    "source": e.source_id,
                    "target": e.target_id,
                    "type": e.relation_type,
                    "edge_type": e.edge_type,
                    "description": e.description,
                }
                for e in edges
                if e.source_id in node_ids and e.target_id in node_ids
            ],
            "books": [
                {"id": b.id, "title": b.title, "cover": b.cover_image}
                for b in books
            ],
            "book_info_map": book_info_map,
        }

    def get_statistics(self) -> Dict[str, Any]:
        total_nodes = self.db.query(KnowledgeNode).count()
        total_edges = self.db.query(KnowledgeEdge).count()

        entity_types = (
            self.db.query(KnowledgeNode.entity_type, self.db.func.count(KnowledgeNode.id))
            .group_by(KnowledgeNode.entity_type)
            .all()
        )

        return {
            "total_nodes": total_nodes,
            "total_edges": total_edges,
            "nodes_by_type": [{"type": t, "count": c} for t, c in entity_types],
        }

    def delete_node(self, node_id: str) -> bool:
        node = self.get_node(node_id)
        if not node:
            return False

        self.db.query(KnowledgeEdge).filter(
            or_(
                KnowledgeEdge.source_id == node_id,
                KnowledgeEdge.target_id == node_id,
            )
        ).delete()

        self.db.delete(node)
        self.db.commit()
        return True

    def update_node(self, node_id: str, name: str = None, description: str = None) -> Optional[KnowledgeNode]:
        node = self.get_node(node_id)
        if not node:
            return None
        
        if name is not None:
            node.name = name
        if description is not None:
            node.description = description
        
        self.db.commit()
        self.db.refresh(node)
        return node

    def clear_all(self) -> None:
        self.db.query(KnowledgeEdge).delete()
        self.db.query(KnowledgeNode).delete()
        self.db.commit()

    def find_parent_summary(self, book_id: str, text_position: int) -> Optional[str]:
        prev_summary = (
            self.db.query(KnowledgeNode)
            .filter(
                KnowledgeNode.book_id == book_id,
                KnowledgeNode.node_type == "QuickSummary",
                KnowledgeNode.text_position <= text_position,
            )
            .order_by(KnowledgeNode.text_position.desc())
            .first()
        )
        return prev_summary.id if prev_summary else None

    def create_detailed_question(
        self,
        name: str,
        description: str = "",
        book_id: str = None,
        book_title: str = None,
        chapter_index: int = None,
        text_position: int = None,
        extra_data: dict = None,
    ) -> KnowledgeNode:
        parent_summary_id = None
        if book_id and text_position is not None:
            parent_summary_id = self.find_parent_summary(book_id, text_position)
        
        node = self.create_node(
            name=name,
            description=description,
            entity_type="Concept",
            book_id=book_id,
            book_title=book_title,
            chapter_index=chapter_index,
            node_type="DetailedQuestion",
            text_position=text_position,
            parent_summary_id=parent_summary_id,
            extra_data=extra_data,
        )
        
        if parent_summary_id:
            self.create_edge(
                source_id=parent_summary_id,
                target_id=node.id,
                relation_type="HAS_QUESTION",
                edge_type="BRANCH_EXTEND",
            )
        
        return node
