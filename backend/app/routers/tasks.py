from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from datetime import datetime, timedelta, UTC
from typing import Optional, List
import json

from ..database import get_db
from ..models import Task

router = APIRouter(tags=["tasks"])


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    task_type: str = "general"
    target_value: Optional[int] = None
    priority: str = "normal"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    completed: Optional[int] = None
    current_value: Optional[int] = None
    priority: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    due_date: datetime
    completed: int
    completed_at: Optional[datetime]
    task_type: str
    target_value: Optional[int]
    current_value: int
    priority: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[TaskResponse])
def get_tasks(include_completed: bool = False, db: Session = Depends(get_db)):
    """获取任务列表"""
    query = db.query(Task)

    if not include_completed:
        query = query.filter(Task.completed == 0)

    tasks = query.order_by(Task.due_date.asc()).all()
    return tasks


@router.post("", response_model=TaskResponse)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    """创建新任务"""
    db_task = Task(
        title=task.title,
        description=task.description,
        due_date=task.due_date,
        task_type=task.task_type,
        target_value=task.target_value,
        priority=task.priority,
        completed=0,
        current_value=0,
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(task_id: str, task_update: TaskUpdate, db: Session = Depends(get_db)):
    """更新任务"""
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = task_update.dict(exclude_unset=True)

    if "completed" in update_data and update_data["completed"] == 1:
        update_data["completed_at"] = datetime.now(UTC)

    for key, value in update_data.items():
        setattr(db_task, key, value)

    db.commit()
    db.refresh(db_task)
    return db_task


@router.delete("/{task_id}")
def delete_task(task_id: str, db: Session = Depends(get_db)):
    """删除任务"""
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(db_task)
    db.commit()
    return {"success": True, "message": "Task deleted"}


@router.post("/{task_id}/complete", response_model=TaskResponse)
def complete_task(task_id: str, db: Session = Depends(get_db)):
    """标记任务为完成"""
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    db_task.completed = 1
    db_task.completed_at = datetime.now(UTC)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.post("/{task_id}/uncomplete", response_model=TaskResponse)
def uncomplete_task(task_id: str, db: Session = Depends(get_db)):
    """取消任务完成状态"""
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    db_task.completed = 0
    db_task.completed_at = None
    db.commit()
    db.refresh(db_task)
    return db_task


@router.get("/upcoming", response_model=List[TaskResponse])
def get_upcoming_tasks(days: int = 7, db: Session = Depends(get_db)):
    """获取即将到期的任务"""
    now = datetime.now(UTC)
    end_date = now + timedelta(days=days)

    tasks = (
        db.query(Task)
        .filter(Task.completed == 0, Task.due_date >= now, Task.due_date <= end_date)
        .order_by(Task.due_date.asc())
        .all()
    )

    return tasks


@router.get("/overdue", response_model=List[TaskResponse])
def get_overdue_tasks(db: Session = Depends(get_db)):
    """获取已过期的任务"""
    now = datetime.now(UTC)

    tasks = (
        db.query(Task)
        .filter(Task.completed == 0, Task.due_date < now)
        .order_by(Task.due_date.asc())
        .all()
    )

    return tasks
