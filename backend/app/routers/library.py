from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import tempfile
import os
import shutil
import fitz
import io
import base64
import re
import hashlib
from PIL import Image
from app.database import get_db
from app.models import Country, Category, TimePeriod, BookDocument

router = APIRouter()

UPLOAD_DIR = "uploads/books"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def generate_safe_filename(original_filename: str, short_hash: str = None) -> str:
    """
    生成安全的文件名：原始文件名 + 短哈希后缀
    
    Args:
        original_filename: 原始文件名，如 "百年孤独.pdf"
        short_hash: 短哈希值（可选），如果不提供则自动生成
    
    Returns:
        安全的文件名，如 "百年孤独_abc123.pdf"
    """
    name, ext = os.path.splitext(original_filename)
    
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', '_', name)
    name = name.strip('._')
    
    if len(name) > 100:
        name = name[:100]
    
    if not short_hash:
        short_hash = hashlib.md5(original_filename.encode()).hexdigest()[:8]
    
    safe_filename = f"{name}_{short_hash}{ext}"
    
    return safe_filename


class CountryCreate(BaseModel):
    name: str
    code: str
    region: Optional[str] = None
    continent: Optional[str] = None
    geojson_properties: Optional[dict] = None


class CountryResponse(BaseModel):
    id: str
    name: str
    code: str
    region: Optional[str]
    continent: Optional[str]
    geojson_properties: Optional[dict]
    book_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None


class CategoryResponse(BaseModel):
    id: str
    name: str
    parent_id: Optional[str]
    book_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TimePeriodCreate(BaseModel):
    name: str
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    country_id: Optional[str] = None
    parent_id: Optional[str] = None
    description: Optional[str] = None


class TimePeriodResponse(BaseModel):
    id: str
    name: str
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    country_id: Optional[str] = None
    parent_id: Optional[str] = None
    description: Optional[str] = None
    book_count: int = 0
    children: List['TimePeriodResponse'] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookDocumentCreate(BaseModel):
    title: str
    author: Optional[str] = None
    description: Optional[str] = None
    country_id: Optional[str] = None
    category_id: Optional[str] = None
    time_period_id: Optional[str] = None
    author_era: Optional[str] = None
    theme_year_start: Optional[int] = None
    theme_year_end: Optional[int] = None
    theme_year_status: Optional[str] = "暂未确定"
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    tags: Optional[List[str]] = None
    metadata: Optional[dict] = None
    content_region_id: Optional[str] = None
    author_region_id: Optional[str] = None
    content_era_start: Optional[int] = None
    content_era_end: Optional[int] = None
    author_birth_year: Optional[int] = None
    author_death_year: Optional[int] = None
    content_era_description: Optional[str] = None
    author_era_description: Optional[str] = None


class BookTimePeriodResponse(BaseModel):
    id: str
    book_id: str
    theme_year_start: Optional[int]
    theme_year_end: Optional[int]
    theme_year_status: Optional[str]
    start_page: Optional[int]
    end_page: Optional[int]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookDocumentResponse(BaseModel):
    id: str
    title: str
    original_filename: Optional[str] = None
    author: Optional[str]
    description: Optional[str]
    file_path: str
    file_size: Optional[int]
    cover_image: Optional[str]
    thumbnail: Optional[str] = None
    country_id: Optional[str]
    category_id: Optional[str]
    time_period_id: Optional[str]
    author_era: Optional[str]
    year_start: Optional[int]
    year_end: Optional[int]
    theme_year_start: Optional[int]
    theme_year_end: Optional[int]
    theme_year_status: Optional[str]
    tags: Optional[List[str]]
    extra_metadata: Optional[dict]
    content_region_id: Optional[str]
    author_region_id: Optional[str]
    content_era_start: Optional[int]
    content_era_end: Optional[int]
    author_birth_year: Optional[int]
    author_death_year: Optional[int]
    content_era_description: Optional[str]
    author_era_description: Optional[str]
    file_hash_sha256: Optional[str] = None
    content_hash_simhash: Optional[str] = None
    page_count: Optional[int] = None
    quark_share_url: Optional[str] = None
    quark_file_id: Optional[str] = None
    quark_upload_status: Optional[str] = None
    quark_upload_time: Optional[datetime] = None
    time_periods: List[BookTimePeriodResponse] = []
    country: Optional[CountryResponse] = None
    category: Optional[CategoryResponse] = None
    time_period: Optional[TimePeriodResponse] = None
    content_region: Optional[CountryResponse] = None
    author_region: Optional[CountryResponse] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TimelineEntry(BaseModel):
    year: int
    books: List[BookDocumentResponse]


@router.get("/countries", response_model=List[CountryResponse])
def list_countries(db: Session = Depends(get_db)):
    countries = db.query(Country).all()
    result = []
    for country in countries:
        book_count = db.query(BookDocument).filter(
            (BookDocument.country_id == country.id) |
            (BookDocument.content_region_id == country.id) |
            (BookDocument.author_region_id == country.id)
        ).count()
        result.append(CountryResponse(
            id=country.id,
            name=country.name,
            code=country.code,
            region=country.region,
            continent=country.continent,
            geojson_properties=country.geojson_properties,
            book_count=book_count,
            created_at=country.created_at,
            updated_at=country.updated_at
        ))
    return result


@router.post("/countries", response_model=CountryResponse)
def create_country(country: CountryCreate, db: Session = Depends(get_db)):
    existing = db.query(Country).filter(Country.code == country.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Country code already exists")
    
    db_country = Country(
        name=country.name,
        code=country.code,
        region=country.region,
        continent=country.continent,
        geojson_properties=country.geojson_properties
    )
    db.add(db_country)
    db.commit()
    db.refresh(db_country)
    
    return CountryResponse(
        id=db_country.id,
        name=db_country.name,
        code=db_country.code,
        region=db_country.region,
        continent=db_country.continent,
        geojson_properties=db_country.geojson_properties,
        book_count=0,
        created_at=db_country.created_at,
        updated_at=db_country.updated_at
    )


@router.get("/countries/{country_id}", response_model=CountryResponse)
def get_country(country_id: str, db: Session = Depends(get_db)):
    country = db.query(Country).filter(Country.id == country_id).first()
    if not country:
        raise HTTPException(status_code=404, detail="Country not found")
    
    book_count = db.query(BookDocument).filter(
        (BookDocument.country_id == country.id) |
        (BookDocument.content_region_id == country.id) |
        (BookDocument.author_region_id == country.id)
    ).count()
    return CountryResponse(
        id=country.id,
        name=country.name,
        code=country.code,
        region=country.region,
        continent=country.continent,
        geojson_properties=country.geojson_properties,
        book_count=book_count,
        created_at=country.created_at,
        updated_at=country.updated_at
    )


@router.get("/countries/code/{country_code}", response_model=CountryResponse)
def get_country_by_code(country_code: str, db: Session = Depends(get_db)):
    country = db.query(Country).filter(Country.code == country_code).first()
    if not country:
        raise HTTPException(status_code=404, detail="Country not found")
    
    book_count = db.query(BookDocument).filter(
        (BookDocument.country_id == country.id) |
        (BookDocument.content_region_id == country.id) |
        (BookDocument.author_region_id == country.id)
    ).count()
    return CountryResponse(
        id=country.id,
        name=country.name,
        code=country.code,
        region=country.region,
        continent=country.continent,
        geojson_properties=country.geojson_properties,
        book_count=book_count,
        created_at=country.created_at,
        updated_at=country.updated_at
    )


@router.get("/categories", response_model=List[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).all()
    result = []
    for cat in categories:
        book_count = db.query(BookDocument).filter(BookDocument.category_id == cat.id).count()
        result.append(CategoryResponse(
            id=cat.id,
            name=cat.name,
            parent_id=cat.parent_id,
            book_count=book_count,
            created_at=cat.created_at,
            updated_at=cat.updated_at
        ))
    return result


@router.post("/categories", response_model=CategoryResponse)
def create_category(category: CategoryCreate, db: Session = Depends(get_db)):
    db_category = Category(
        name=category.name,
        parent_id=category.parent_id
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    
    return CategoryResponse(
        id=db_category.id,
        name=db_category.name,
        parent_id=db_category.parent_id,
        book_count=0,
        created_at=db_category.created_at,
        updated_at=db_category.updated_at
    )


@router.get("/time-periods", response_model=List[TimePeriodResponse])
def list_time_periods(country_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(TimePeriod)
    if country_id:
        query = query.filter(TimePeriod.country_id == country_id)
    periods = query.all()
    
    result = []
    for period in periods:
        book_count = db.query(BookDocument).filter(BookDocument.time_period_id == period.id).count()
        result.append(TimePeriodResponse(
            id=period.id,
            name=period.name,
            start_year=period.start_year,
            end_year=period.end_year,
            country_id=period.country_id,
            book_count=book_count,
            created_at=period.created_at,
            updated_at=period.updated_at
        ))
    return result


@router.post("/time-periods", response_model=TimePeriodResponse)
def create_time_period(period: TimePeriodCreate, db: Session = Depends(get_db)):
    db_period = TimePeriod(
        name=period.name,
        start_year=period.start_year,
        end_year=period.end_year,
        country_id=period.country_id,
        parent_id=period.parent_id,
        description=period.description
    )
    db.add(db_period)
    db.commit()
    db.refresh(db_period)
    
    return TimePeriodResponse(
        id=db_period.id,
        name=db_period.name,
        start_year=db_period.start_year,
        end_year=db_period.end_year,
        country_id=db_period.country_id,
        parent_id=db_period.parent_id,
        description=db_period.description,
        book_count=0,
        children=[],
        created_at=db_period.created_at,
        updated_at=db_period.updated_at
    )


def extract_pdf_metadata(file_path: str) -> dict:
    result = {
        'author': None,
        'title': None,
        'subject': None,
        'keywords': None,
    }
    
    try:
        doc = fitz.open(file_path)
        metadata = doc.metadata
        
        if metadata:
            result['author'] = metadata.get('author') or metadata.get('Author')
            result['title'] = metadata.get('title') or metadata.get('Title')
            result['subject'] = metadata.get('subject') or metadata.get('Subject')
            result['keywords'] = metadata.get('keywords') or metadata.get('Keywords')
        
        doc.close()
    except Exception as e:
        print(f"Failed to extract metadata: {e}")
    
    return result


def generate_epub_cover_internal(file_path: str) -> tuple:
    try:
        import zipfile
        import xml.etree.ElementTree as ET
        
        with zipfile.ZipFile(file_path, 'r') as epub:
            container_xml = epub.read('META-INF/container.xml')
            root = ET.fromstring(container_xml)
            ns = {'container': 'urn:oasis:names:tc:opendocument:xmlns:container'}
            rootfile = root.find('.//container:rootfile', ns)
            if rootfile is None:
                return None, None
            
            opf_path = rootfile.get('full-path')
            opf_content = epub.read(opf_path)
            opf_root = ET.fromstring(opf_content)
            
            cover_meta = None
            for meta in opf_root.iter():
                if meta.get('name') == 'cover':
                    cover_meta = meta.get('content')
                    break
            
            cover_image_path = None
            if cover_meta:
                for item in opf_root.iter():
                    if item.get('id') == cover_meta:
                        cover_image_path = item.get('href')
                        break
            
            if cover_image_path:
                opf_dir = os.path.dirname(opf_path)
                if opf_dir:
                    cover_image_path = os.path.join(opf_dir, cover_image_path).replace('\\', '/')
                
                try:
                    image_data = epub.read(cover_image_path)
                    img = Image.open(io.BytesIO(image_data))
                    
                    max_height = 800
                    if img.size[1] > max_height:
                        ratio = max_height / img.size[1]
                        new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                        img = img.resize(new_size, Image.Resampling.LANCZOS)
                    
                    output = io.BytesIO()
                    img.save(output, format='JPEG', quality=85, optimize=True)
                    output.seek(0)
                    cover_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
                    cover_data_url = f"data:image/jpeg;base64,{cover_base64}"
                    
                    thumbnail_height = 200
                    if img.size[1] > thumbnail_height:
                        ratio = thumbnail_height / img.size[1]
                        new_thumb_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                        thumb_img = img.resize(new_thumb_size, Image.Resampling.LANCZOS)
                    else:
                        thumb_img = img
                    
                    output_thumb = io.BytesIO()
                    thumb_img.save(output_thumb, format='JPEG', quality=60, optimize=True)
                    output_thumb.seek(0)
                    thumbnail_base64 = base64.b64encode(output_thumb.getvalue()).decode('utf-8')
                    thumbnail_data_url = f"data:image/jpeg;base64,{thumbnail_base64}"
                    
                    return cover_data_url, thumbnail_data_url
                except Exception as e:
                    print(f"Failed to extract EPUB cover image: {e}")
            
            return None, None
            
    except Exception as e:
        print(f"Failed to generate EPUB cover: {e}")
        return None, None


def generate_pdf_cover(file_path: str) -> tuple:
    file_ext = os.path.splitext(file_path)[1].lower()
    
    if file_ext == '.pdf':
        return generate_pdf_cover_internal(file_path)
    elif file_ext == '.epub':
        return generate_epub_cover_internal(file_path)
    else:
        return None, None


def generate_pdf_cover_internal(file_path: str) -> tuple:
    try:
        doc = fitz.open(file_path)
        if len(doc) == 0:
            return None, None
        
        page = doc[0]
        
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        
        max_height = 800
        if img.size[1] > max_height:
            ratio = max_height / img.size[1]
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        output.seek(0)
        cover_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
        cover_data_url = f"data:image/jpeg;base64,{cover_base64}"
        
        thumbnail_height = 200
        if img.size[1] > thumbnail_height:
            ratio = thumbnail_height / img.size[1]
            new_thumb_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            thumb_img = img.resize(new_thumb_size, Image.Resampling.LANCZOS)
        else:
            thumb_img = img
        
        output_thumb = io.BytesIO()
        thumb_img.save(output_thumb, format='JPEG', quality=60, optimize=True)
        output_thumb.seek(0)
        thumbnail_base64 = base64.b64encode(output_thumb.getvalue()).decode('utf-8')
        thumbnail_data_url = f"data:image/jpeg;base64,{thumbnail_base64}"
        
        return cover_data_url, thumbnail_data_url
        
    except Exception as e:
        print(f"Failed to generate cover: {e}")
        return None, None


@router.post("/books/upload", response_model=BookDocumentResponse)
async def upload_book(
    file: UploadFile = File(...),
    title: str = Form(...),
    author: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    country_id: Optional[str] = Form(None),
    category_id: Optional[str] = Form(None),
    time_period_id: Optional[str] = Form(None),
    author_era: Optional[str] = Form(None),
    theme_year_start: Optional[int] = Form(None),
    theme_year_end: Optional[int] = Form(None),
    theme_year_status: Optional[str] = Form("暂未确定"),
    year_start: Optional[int] = Form(None),
    year_end: Optional[int] = Form(None),
    tags: Optional[str] = Form(None),
    content_region_id: Optional[str] = Form(None),
    author_region_id: Optional[str] = Form(None),
    content_era_start: Optional[int] = Form(None),
    content_era_end: Optional[int] = Form(None),
    author_birth_year: Optional[int] = Form(None),
    author_death_year: Optional[int] = Form(None),
    content_era_description: Optional[str] = Form(None),
    author_era_description: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    print(f"\n=== 上传请求 ===")
    print(f"文件名: {file.filename}")
    print(f"标题: {title}")
    print(f"Content-Type: {file.content_type}")
    
    if not file.filename:
        print(f"错误: 没有选择文件")
        raise HTTPException(status_code=400, detail="No file selected")
    
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ['.pdf', '.epub']:
        print(f"错误: 不支持的文件格式 {file_ext}")
        raise HTTPException(status_code=400, detail=f"Only PDF and EPUB files are supported, got {file_ext}")
    
    safe_filename = generate_safe_filename(file.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size = os.path.getsize(file_path)
        
        from app.services.duplicate_detector import duplicate_detector
        file_hash = duplicate_detector.calculate_file_hash(file_path)
        content_hash, _ = duplicate_detector.calculate_content_hash(file_path)
        page_count = duplicate_detector.get_page_count(file_path)
        
        tags_list = []
        if tags:
            tags_list = [t.strip() for t in tags.split(",") if t.strip()]
        
        cover_image, thumbnail = generate_pdf_cover(file_path)
        
        pdf_metadata = extract_pdf_metadata(file_path)
        
        final_author = author
        if not final_author and pdf_metadata['author']:
            final_author = pdf_metadata['author']
        
        db_book = BookDocument(
            title=title,
            original_filename=file.filename,
            author=final_author,
            description=description,
            file_path=file_path,
            file_size=file_size,
            cover_image=cover_image,
            thumbnail=thumbnail,
            country_id=country_id,
            category_id=category_id,
            time_period_id=time_period_id,
            author_era=author_era,
            year_start=year_start,
            year_end=year_end,
            tags=tags_list,
            content_region_id=content_region_id,
            author_region_id=author_region_id,
            content_era_start=content_era_start,
            content_era_end=content_era_end,
            author_birth_year=author_birth_year,
            author_death_year=author_death_year,
            content_era_description=content_era_description,
            author_era_description=author_era_description,
            file_hash_sha256=file_hash,
            content_hash_simhash=content_hash,
            page_count=page_count
        )
        db.add(db_book)
        db.commit()
        db.refresh(db_book)
        
        if theme_year_start is not None or theme_year_end is not None:
            from app.models import BookTimePeriod
            book_time_period = BookTimePeriod(
                book_id=db_book.id,
                theme_year_start=theme_year_start,
                theme_year_end=theme_year_end,
                theme_year_status=theme_year_status or "暂未确定"
            )
            db.add(book_time_period)
            db.commit()
            db.refresh(db_book)
        
        return _build_book_response(db_book, db)
    
    except Exception as e:
        if os.path.exists(file_path):
            os.unlink(file_path)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/books/upload-with-path", response_model=BookDocumentResponse)
async def upload_book_with_path(
    file: UploadFile = File(...),
    title: str = Form(...),
    relative_path: Optional[str] = Form(None),
    country_id: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    category_id: Optional[str] = Form(None),
    time_period_id: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    上传书籍并保留文件夹层级结构
    
    relative_path: 文件的相对路径，格式为 "文件夹名/子文件夹/文件名.pdf"
    系统会根据相对路径自动创建文件夹层级结构
    """
    print(f"\n=== 上传请求（带路径）===")
    print(f"文件名: {file.filename}")
    print(f"标题: {title}")
    print(f"相对路径: {relative_path}")
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ['.pdf', '.epub', '.txt', '.doc', '.docx']:
        raise HTTPException(status_code=400, detail=f"Only PDF, EPUB, TXT, DOC and DOCX files are supported, got {file_ext}")
    
    # 根据相对路径创建文件夹层级结构
    folder_id = None
    if relative_path:
        folder_id = await create_folder_structure_from_path(relative_path, db)
    
    safe_filename = generate_safe_filename(file.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size = os.path.getsize(file_path)
        
        from app.services.duplicate_detector import duplicate_detector
        file_hash = duplicate_detector.calculate_file_hash(file_path)
        content_hash, _ = duplicate_detector.calculate_content_hash(file_path)
        page_count = duplicate_detector.get_page_count(file_path)
        
        tags_list = []
        if tags:
            tags_list = [t.strip() for t in tags.split(",") if t.strip()]
        
        cover_image, thumbnail = None, None
        if file_ext == '.pdf':
            cover_image, thumbnail = generate_pdf_cover(file_path)
            pdf_metadata = extract_pdf_metadata(file_path)
            if not author and pdf_metadata['author']:
                author = pdf_metadata['author']
        
        db_book = BookDocument(
            title=title,
            original_filename=file.filename,
            author=author,
            description=description,
            file_path=file_path,
            file_size=file_size,
            cover_image=cover_image,
            thumbnail=thumbnail,
            country_id=country_id,
            category_id=category_id,
            time_period_id=time_period_id,
            tags=tags_list,
            file_hash_sha256=file_hash,
            content_hash_simhash=content_hash,
            page_count=page_count
        )
        db.add(db_book)
        db.commit()
        db.refresh(db_book)
        
        # 如果有文件夹ID，创建书籍与文件夹的关联
        if folder_id:
            # 这里可以添加书籍与文件夹的关联逻辑
            # 目前书籍模型没有folder_id字段，可以考虑添加或使用其他方式关联
            pass
        
        return _build_book_response(db_book, db)
    
    except Exception as e:
        if os.path.exists(file_path):
            os.unlink(file_path)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


async def create_folder_structure_from_path(relative_path: str, db: Session) -> str:
    """
    根据相对路径创建文件夹层级结构
    
    Args:
        relative_path: 文件的相对路径，格式为 "文件夹名/子文件夹/文件名.pdf"
        db: 数据库会话
    
    Returns:
        最终文件夹的ID
    """
    from app.models import Folder
    
    # 分割路径，去掉最后的文件名
    path_parts = relative_path.replace('\\', '/').split('/')
    if len(path_parts) <= 1:
        # 没有文件夹结构，直接返回None
        return None
    
    # 去掉最后的文件名，只保留文件夹路径
    folder_parts = path_parts[:-1]
    
    parent_id = None
    current_folder_id = None
    
    for folder_name in folder_parts:
        # 查找是否已存在同名文件夹
        existing_folder = db.query(Folder).filter(
            Folder.name == folder_name,
            Folder.parent_id == parent_id
        ).first()
        
        if existing_folder:
            current_folder_id = existing_folder.id
        else:
            # 创建新文件夹
            new_folder = Folder(
                name=folder_name,
                parent_id=parent_id
            )
            db.add(new_folder)
            db.commit()
            db.refresh(new_folder)
            current_folder_id = new_folder.id
            print(f"创建文件夹: {folder_name} (parent_id: {parent_id})")
        
        parent_id = current_folder_id
    
    return current_folder_id


@router.post("/books/upload-batch", response_model=List[BookDocumentResponse])
async def upload_books_batch(
    files: List[UploadFile] = File(...),
    country_id: Optional[str] = Form(None),
    skip_duplicates: Optional[bool] = Form(True),
    db: Session = Depends(get_db)
):
    from app.services.duplicate_detector import duplicate_detector
    
    results = []
    duplicates_found = []
    temp_files = []
    
    for file in files:
        if not file.filename:
            continue
        
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in ['.pdf', '.epub']:
            continue
        
        title = os.path.splitext(file.filename)[0]
        safe_filename = generate_safe_filename(file.filename)
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            temp_files.append(file_path)
            
            file_hash = duplicate_detector.calculate_file_hash(file_path)
            content_hash, _ = duplicate_detector.calculate_content_hash(file_path)
            page_count = duplicate_detector.get_page_count(file_path)
            
            existing_by_hash = db.query(BookDocument).filter(
                BookDocument.file_hash_sha256 == file_hash
            ).first()
            
            if existing_by_hash and skip_duplicates:
                duplicates_found.append({
                    "filename": file.filename,
                    "title": title,
                    "duplicate_type": "exact",
                    "existing_book_id": existing_by_hash.id,
                    "existing_book_title": existing_by_hash.title,
                    "similarity_score": 1.0
                })
                os.unlink(file_path)
                temp_files.remove(file_path)
                continue
            
            existing_by_content = db.query(BookDocument).filter(
                BookDocument.content_hash_simhash == content_hash
            ).first()
            
            if existing_by_content and skip_duplicates:
                duplicates_found.append({
                    "filename": file.filename,
                    "title": title,
                    "duplicate_type": "content",
                    "existing_book_id": existing_by_content.id,
                    "existing_book_title": existing_by_content.title,
                    "similarity_score": 0.95
                })
                os.unlink(file_path)
                temp_files.remove(file_path)
                continue
            
            file_size = os.path.getsize(file_path)
            
            cover_image, thumbnail = generate_pdf_cover(file_path)
            
            duplicate_group_id = None
            is_primary = 1
            duplicate_status = 'unique'
            
            db_book = BookDocument(
                title=title,
                file_path=file_path,
                file_size=file_size,
                cover_image=cover_image,
                thumbnail=thumbnail,
                country_id=country_id,
                file_hash_sha256=file_hash,
                content_hash_simhash=content_hash,
                page_count=page_count,
                duplicate_group_id=duplicate_group_id,
                is_primary=is_primary,
                duplicate_status=duplicate_status
            )
            db.add(db_book)
            db.commit()
            db.refresh(db_book)
            results.append(_build_book_response(db_book, db))
            
        except Exception as e:
            print(f"Error processing file {file.filename}: {e}")
            if os.path.exists(file_path):
                os.unlink(file_path)
                if file_path in temp_files:
                    temp_files.remove(file_path)
            continue
    
    if duplicates_found:
        print(f"\n=== 批量上传重复检测报告 ===")
        print(f"总上传文件数: {len(files)}")
        print(f"成功上传: {len(results)} 本")
        print(f"检测到重复: {len(duplicates_found)} 本")
        for dup in duplicates_found:
            print(f"  - {dup['filename']} 与已存在的《{dup['existing_book_title']}》重复 ({dup['duplicate_type']})")
        print(f"===========================\n")
    
    return results


@router.post("/books/check-duplicates-batch")
async def check_duplicates_batch(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    from app.services.duplicate_detector import duplicate_detector
    
    results = {
        "total_files": len(files),
        "unique_files": [],
        "duplicate_files": [],
        "check_details": []
    }
    
    temp_dir = os.path.join(UPLOAD_DIR, "temp_check")
    os.makedirs(temp_dir, exist_ok=True)
    
    for file in files:
        if not file.filename:
            continue
        
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in ['.pdf', '.epub']:
            results["check_details"].append({
                "filename": file.filename,
                "status": "skipped",
                "reason": "不支持的文件格式"
            })
            continue
        
        temp_file_path = os.path.join(temp_dir, f"check_{os.urandom(8).hex()}{file_ext}")
        
        try:
            with open(temp_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            title = os.path.splitext(file.filename)[0]
            file_hash = duplicate_detector.calculate_file_hash(temp_file_path)
            content_hash, _ = duplicate_detector.calculate_content_hash(temp_file_path)
            page_count = duplicate_detector.get_page_count(temp_file_path)
            
            existing_by_hash = db.query(BookDocument).filter(
                BookDocument.file_hash_sha256 == file_hash
            ).first()
            
            if existing_by_hash:
                results["duplicate_files"].append({
                    "filename": file.filename,
                    "title": title,
                    "duplicate_type": "exact",
                    "existing_book_id": existing_by_hash.id,
                    "existing_book_title": existing_by_hash.title,
                    "existing_book_author": existing_by_hash.author,
                    "similarity_score": 1.0,
                    "file_size": os.path.getsize(temp_file_path),
                    "page_count": page_count
                })
                results["check_details"].append({
                    "filename": file.filename,
                    "status": "duplicate",
                    "duplicate_type": "exact",
                    "existing_book_title": existing_by_hash.title
                })
            else:
                existing_by_content = db.query(BookDocument).filter(
                    BookDocument.content_hash_simhash == content_hash
                ).first()
                
                if existing_by_content:
                    results["duplicate_files"].append({
                        "filename": file.filename,
                        "title": title,
                        "duplicate_type": "content",
                        "existing_book_id": existing_by_content.id,
                        "existing_book_title": existing_by_content.title,
                        "existing_book_author": existing_by_content.author,
                        "similarity_score": 0.95,
                        "file_size": os.path.getsize(temp_file_path),
                        "page_count": page_count
                    })
                    results["check_details"].append({
                        "filename": file.filename,
                        "status": "duplicate",
                        "duplicate_type": "content",
                        "existing_book_title": existing_by_content.title
                    })
                else:
                    results["unique_files"].append({
                        "filename": file.filename,
                        "title": title,
                        "file_hash": file_hash,
                        "content_hash": content_hash,
                        "file_size": os.path.getsize(temp_file_path),
                        "page_count": page_count
                    })
                    results["check_details"].append({
                        "filename": file.filename,
                        "status": "unique"
                    })
        except Exception as e:
            results["check_details"].append({
                "filename": file.filename,
                "status": "error",
                "reason": str(e)
            })
        finally:
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
    
    try:
        os.rmdir(temp_dir)
    except:
        pass
    
    return results


@router.get("/books", response_model=List[BookDocumentResponse])
def list_books(
    country_id: Optional[str] = None,
    category_id: Optional[str] = None,
    time_period_id: Optional[str] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(BookDocument)
    
    if country_id:
        query = query.filter(BookDocument.country_id == country_id)
    if category_id:
        query = query.filter(BookDocument.category_id == category_id)
    if time_period_id:
        query = query.filter(BookDocument.time_period_id == time_period_id)
    if year_from is not None:
        query = query.filter(BookDocument.year_start >= year_from)
    if year_to is not None:
        query = query.filter(BookDocument.year_end <= year_to)
    if search:
        query = query.filter(BookDocument.title.ilike(f"%{search}%"))
    
    books = query.order_by(BookDocument.created_at.desc()).all()
    
    return [_build_book_response(book, db) for book in books]


@router.get("/tags")
def get_all_tags(db: Session = Depends(get_db)):
    books = db.query(BookDocument).filter(BookDocument.tags.isnot(None)).all()
    
    tag_set = set()
    for book in books:
        if book.tags:
            for tag in book.tags:
                if tag:
                    tag_set.add(tag)
    
    return {"tags": sorted(list(tag_set))}


@router.get("/books/{book_id}", response_model=BookDocumentResponse)
def get_book(book_id: str, db: Session = Depends(get_db)):
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    return _build_book_response(book, db)


@router.put("/books/{book_id}", response_model=BookDocumentResponse)
def update_book(book_id: str, update_data: dict, db: Session = Depends(get_db)):
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    allowed_fields = [
        'title', 'author', 'description', 'country_id', 
        'category_id', 'time_period_id', 'year_start', 'year_end', 
        'tags', 'metadata',
        'theme_year_start', 'theme_year_end', 'theme_year_status',
        'content_era_start', 'content_era_end',
        'content_region_id', 'author_region_id',
        'author_birth_year', 'author_death_year',
        'content_era_description', 'author_era_description',
        'author_era'
    ]
    
    for key, value in update_data.items():
        if key in allowed_fields:
            if key == 'tags' and isinstance(value, list):
                setattr(book, key, value if value else None)
            else:
                setattr(book, key, value)
    
    db.commit()
    db.refresh(book)
    
    return _build_book_response(book, db)


@router.post("/books/{book_id}/rename-file")
def rename_book_file(book_id: str, new_file_name: str, db: Session = Depends(get_db)):
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    if not book.file_path:
        raise HTTPException(status_code=400, detail="Book has no file associated")
    
    old_path = book.file_path
    if not os.path.isabs(old_path):
        old_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), old_path)
    
    if not os.path.exists(old_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    dir_path = os.path.dirname(old_path)
    new_path = os.path.join(dir_path, new_file_name)
    
    if old_path == new_path:
        return {"success": True, "message": "File name unchanged"}
    
    if os.path.exists(new_path):
        raise HTTPException(status_code=400, detail="A file with that name already exists")
    
    try:
        os.rename(old_path, new_path)
        relative_path = f"uploads/books/{new_file_name}"
        book.file_path = relative_path
        db.commit()
        return {"success": True, "new_path": relative_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename file: {str(e)}")


@router.delete("/books/{book_id}")
def delete_book(book_id: str, db: Session = Depends(get_db)):
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    if book.file_path and os.path.exists(book.file_path):
        os.unlink(book.file_path)
    
    db.delete(book)
    db.commit()
    
    return {"message": "Book deleted successfully"}


@router.post("/books/{book_id}/generate-cover")
def generate_book_cover(book_id: str, db: Session = Depends(get_db)):
    import fit
    import io
    import base64
    from PIL import Image
    
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    if not book.file_path or not os.path.exists(book.file_path):
        raise HTTPException(status_code=400, detail="Book file not found")
    
    try:
        doc = fit.open(book.file_path)
        
        if len(doc) == 0:
            raise HTTPException(status_code=400, detail="PDF has no pages")
        
        page = doc[0]
        mat = fit.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        
        max_size = 800
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        output.seek(0)
        
        cover_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
        cover_data_url = f"data:image/jpeg;base64,{cover_base64}"
        
        book.cover_image = cover_data_url
        db.commit()
        db.refresh(book)
        
        return {"cover_image": cover_data_url}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate cover: {str(e)}")


@router.post("/books/{book_id}/generate-thumbnail")
def generate_book_thumbnail(book_id: str, db: Session = Depends(get_db)):
    import fit
    import io
    import base64
    from PIL import Image
    
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    if not book.file_path or not os.path.exists(book.file_path):
        raise HTTPException(status_code=400, detail="Book file not found")
    
    try:
        doc = fit.open(book.file_path)
        
        if len(doc) == 0:
            raise HTTPException(status_code=400, detail="PDF has no pages")
        
        page = doc[0]
        mat = fit.Matrix(0.5, 0.5)
        pix = page.get_pixmap(matrix=mat)
        
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        
        thumbnail_size = 120
        img.thumbnail((thumbnail_size, thumbnail_size), Image.Resampling.LANCZOS)
        
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=60, optimize=True)
        output.seek(0)
        
        thumbnail_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
        thumbnail_data_url = f"data:image/jpeg;base64,{thumbnail_base64}"
        
        book.thumbnail = thumbnail_data_url
        db.commit()
        db.refresh(book)
        
        return {"thumbnail": thumbnail_data_url}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate thumbnail: {str(e)}")


@router.post("/books/generate-all-thumbnails")
def generate_all_thumbnails(db: Session = Depends(get_db)):
    import fit
    import io
    import base64
    from PIL import Image
    
    books = db.query(BookDocument).filter(
        BookDocument.file_path.isnot(None),
        BookDocument.thumbnail.is_(None)
    ).all()
    
    generated = 0
    failed = 0
    
    for book in books:
        if not book.file_path or not os.path.exists(book.file_path):
            failed += 1
            continue
        
        try:
            doc = fit.open(book.file_path)
            
            if len(doc) == 0:
                failed += 1
                continue
            
            page = doc[0]
            mat = fit.Matrix(0.5, 0.5)
            pix = page.get_pixmap(matrix=mat)
            
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            
            thumbnail_size = 120
            img.thumbnail((thumbnail_size, thumbnail_size), Image.Resampling.LANCZOS)
            
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=60, optimize=True)
            output.seek(0)
            
            thumbnail_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
            thumbnail_data_url = f"data:image/jpeg;base64,{thumbnail_base64}"
            
            book.thumbnail = thumbnail_data_url
            generated += 1
            
        except Exception as e:
            print(f"Failed to generate thumbnail for book {book.id}: {e}")
            failed += 1
    
    db.commit()
    
    return {"generated": generated, "failed": failed, "total": len(books)}


@router.post("/books/{book_id}/time-periods")
def create_book_time_period(
    book_id: str,
    data: dict,
    db: Session = Depends(get_db)
):
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    from app.models import BookTimePeriod
    
    db_time_period = BookTimePeriod(
        book_id=book_id,
        theme_year_start=data.get('theme_year_start'),
        theme_year_end=data.get('theme_year_end'),
        theme_year_status=data.get('theme_year_status', '暂未确定'),
        start_page=data.get('start_page'),
        end_page=data.get('end_page'),
        description=data.get('description')
    )
    db.add(db_time_period)
    db.commit()
    db.refresh(db_time_period)
    
    return BookTimePeriodResponse(
        id=db_time_period.id,
        book_id=db_time_period.book_id,
        theme_year_start=db_time_period.theme_year_start,
        theme_year_end=db_time_period.theme_year_end,
        theme_year_status=db_time_period.theme_year_status,
        start_page=db_time_period.start_page,
        end_page=db_time_period.end_page,
        description=db_time_period.description,
        created_at=db_time_period.created_at,
        updated_at=db_time_period.updated_at
    )


@router.put("/time-periods/{time_period_id}")
def update_book_time_period(
    time_period_id: str,
    data: dict,
    db: Session = Depends(get_db)
):
    from app.models import BookTimePeriod
    
    time_period = db.query(BookTimePeriod).filter(BookTimePeriod.id == time_period_id).first()
    if not time_period:
        raise HTTPException(status_code=404, detail="Time period not found")
    
    for key, value in data.items():
        if key in ['theme_year_start', 'theme_year_end', 'theme_year_status', 'start_page', 'end_page', 'description']:
            setattr(time_period, key, value)
    
    db.commit()
    db.refresh(time_period)
    
    return BookTimePeriodResponse(
        id=time_period.id,
        book_id=time_period.book_id,
        theme_year_start=time_period.theme_year_start,
        theme_year_end=time_period.theme_year_end,
        theme_year_status=time_period.theme_year_status,
        start_page=time_period.start_page,
        end_page=time_period.end_page,
        description=time_period.description,
        created_at=time_period.created_at,
        updated_at=time_period.updated_at
    )


@router.delete("/time-periods/{time_period_id}")
def delete_book_time_period(time_period_id: str, db: Session = Depends(get_db)):
    from app.models import BookTimePeriod
    
    time_period = db.query(BookTimePeriod).filter(BookTimePeriod.id == time_period_id).first()
    if not time_period:
        raise HTTPException(status_code=404, detail="Time period not found")
    
    db.delete(time_period)
    db.commit()
    
    return {"message": "Time period deleted successfully"}


@router.get("/countries/{country_id}/timeline", response_model=List[TimelineEntry])
def get_country_timeline(country_id: str, db: Session = Depends(get_db)):
    country = db.query(Country).filter(Country.id == country_id).first()
    if not country:
        raise HTTPException(status_code=404, detail="Country not found")
    
    books = db.query(BookDocument).filter(
        (BookDocument.country_id == country_id) |
        (BookDocument.content_region_id == country_id) |
        (BookDocument.author_region_id == country_id)
    ).order_by(BookDocument.year_start).all()
    
    timeline_dict = {}
    for book in books:
        year = book.year_start or book.year_end or 0
        if year not in timeline_dict:
            timeline_dict[year] = []
        timeline_dict[year].append(_build_book_response(book, db))
    
    timeline = [
        TimelineEntry(year=year, books=books_list)
        for year, books_list in sorted(timeline_dict.items())
    ]
    
    return timeline


@router.get("/countries/{country_id}/books", response_model=List[BookDocumentResponse])
def get_country_books(country_id: str, db: Session = Depends(get_db)):
    books = db.query(BookDocument).filter(
        (BookDocument.country_id == country_id) |
        (BookDocument.content_region_id == country_id) |
        (BookDocument.author_region_id == country_id)
    ).order_by(BookDocument.year_start).all()
    
    return [_build_book_response(book, db) for book in books]


def _build_book_response(book: BookDocument, db: Session) -> BookDocumentResponse:
    country = None
    if book.country_id:
        c = db.query(Country).filter(Country.id == book.country_id).first()
        if c:
            country = CountryResponse(
                id=c.id,
                name=c.name,
                code=c.code,
                region=c.region,
                continent=c.continent,
                geojson_properties=c.geojson_properties,
                book_count=0,
                created_at=c.created_at,
                updated_at=c.updated_at
            )
    
    category = None
    if book.category_id:
        cat = db.query(Category).filter(Category.id == book.category_id).first()
        if cat:
            category = CategoryResponse(
                id=cat.id,
                name=cat.name,
                parent_id=cat.parent_id,
                book_count=0,
                created_at=cat.created_at,
                updated_at=cat.updated_at
            )
    
    time_period = None
    if book.time_period_id:
        tp = db.query(TimePeriod).filter(TimePeriod.id == book.time_period_id).first()
        if tp:
            time_period = TimePeriodResponse(
                id=tp.id,
                name=tp.name,
                start_year=tp.start_year,
                end_year=tp.end_year,
                country_id=tp.country_id,
                parent_id=tp.parent_id,
                description=tp.description,
                book_count=0,
                children=[],
                created_at=tp.created_at,
                updated_at=tp.updated_at
            )
    
    content_region = None
    if book.content_region_id:
        cr = db.query(Country).filter(Country.id == book.content_region_id).first()
        if cr:
            content_region = CountryResponse(
                id=cr.id,
                name=cr.name,
                code=cr.code,
                region=cr.region,
                continent=cr.continent,
                geojson_properties=cr.geojson_properties,
                book_count=0,
                created_at=cr.created_at,
                updated_at=cr.updated_at
            )
    
    author_region = None
    if book.author_region_id:
        ar = db.query(Country).filter(Country.id == book.author_region_id).first()
        if ar:
            author_region = CountryResponse(
                id=ar.id,
                name=ar.name,
                code=ar.code,
                region=ar.region,
                continent=ar.continent,
                geojson_properties=ar.geojson_properties,
                book_count=0,
                created_at=ar.created_at,
                updated_at=ar.updated_at
            )
    
    time_periods = [
        BookTimePeriodResponse(
            id=tp.id,
            book_id=tp.book_id,
            theme_year_start=tp.theme_year_start,
            theme_year_end=tp.theme_year_end,
            theme_year_status=tp.theme_year_status,
            start_page=tp.start_page,
            end_page=tp.end_page,
            description=tp.description,
            created_at=tp.created_at,
            updated_at=tp.updated_at
        )
        for tp in book.time_periods
    ]

    return BookDocumentResponse(
        id=book.id,
        title=book.title,
        original_filename=book.original_filename,
        author=book.author,
        description=book.description,
        file_path=book.file_path,
        file_size=book.file_size,
        cover_image=book.cover_image,
        thumbnail=book.thumbnail,
        country_id=book.country_id,
        category_id=book.category_id,
        time_period_id=book.time_period_id,
        author_era=book.author_era,
        year_start=book.year_start,
        year_end=book.year_end,
        theme_year_start=book.theme_year_start,
        theme_year_end=book.theme_year_end,
        theme_year_status=book.theme_year_status,
        tags=book.tags,
        extra_metadata=book.extra_metadata,
        content_region_id=book.content_region_id,
        author_region_id=book.author_region_id,
        content_era_start=book.content_era_start,
        content_era_end=book.content_era_end,
        author_birth_year=book.author_birth_year,
        author_death_year=book.author_death_year,
        content_era_description=book.content_era_description,
        author_era_description=book.author_era_description,
        file_hash_sha256=book.file_hash_sha256,
        content_hash_simhash=book.content_hash_simhash,
        page_count=book.page_count,
        quark_share_url=book.quark_share_url,
        quark_file_id=book.quark_file_id,
        quark_upload_status=book.quark_upload_status,
        quark_upload_time=book.quark_upload_time,
        time_periods=time_periods,
        country=country,
        category=category,
        time_period=time_period,
        content_region=content_region,
        author_region=author_region,
        created_at=book.created_at,
        updated_at=book.updated_at
    )


class ScannedFile(BaseModel):
    file_name: str
    file_path: str
    file_size: int
    parsed_title: str
    parsed_author: Optional[str] = None
    already_exists: bool = False
    existing_book_id: Optional[str] = None


class ScanResult(BaseModel):
    total_files: int
    new_files: int
    existing_files: int
    files: List[ScannedFile]


@router.get("/scan-folder", response_model=ScanResult)
def scan_upload_folder(db: Session = Depends(get_db)):
    scanned_files = []
    new_files_count = 0
    existing_files_count = 0
    
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        return ScanResult(total_files=0, new_files=0, existing_files=0, files=[])
    
    for root, dirs, files in os.walk(UPLOAD_DIR):
        for file in files:
            if file.lower().endswith('.pdf'):
                file_path = os.path.join(root, files) if len(files) == 1 else os.path.join(root, file)
                file_path = os.path.join(root, file)
                file_size = os.path.getsize(file_path)
                
                existing_book = db.query(BookDocument).filter(
                    BookDocument.file_path == file_path
                ).first()
                
                parsed_title, parsed_author = parse_filename(file)
                
                scanned_file = ScannedFile(
                    file_name=file,
                    file_path=file_path,
                    file_size=file_size,
                    parsed_title=parsed_title,
                    parsed_author=parsed_author,
                    already_exists=existing_book is not None,
                    existing_book_id=existing_book.id if existing_book else None
                )
                
                if existing_book:
                    existing_files_count += 1
                else:
                    new_files_count += 1
                
                scanned_files.append(scanned_file)
    
    return ScanResult(
        total_files=len(scanned_files),
        new_files=new_files_count,
        existing_files=existing_files_count,
        files=scanned_files
    )


def parse_filename(filename: str) -> tuple:
    name = os.path.splitext(filename)[0]
    
    author = None
    title = name
    
    patterns = [
        (r'^(.+?)\s*\((.+?)\)\s*\(Z-Library\)$', lambda m: (m.group(1).strip(), m.group(2).strip())),
        (r'^(.+?)\s*[-–]\s*(.+?)$', lambda m: (m.group(2).strip(), m.group(1).strip())),
        (r'^(.+?)\s*\[(.+?)\]$', lambda m: (m.group(1).strip(), m.group(2).strip())),
        (r'^(.+?)\s*《(.+?)》$', lambda m: (m.group(2).strip(), m.group(1).strip())),
    ]
    
    import re
    for pattern, extractor in patterns:
        match = re.match(pattern, name)
        if match:
            try:
                title, author = extractor(match)
                break
            except:
                continue
    
    if not author:
        author_match = re.search(r'\(([^)]+)\)', name)
        if author_match:
            potential_author = author_match.group(1).strip()
            if len(potential_author) < 20 and not potential_author[0].isdigit():
                author = potential_author
                title = name[:author_match.start()].strip()
    
    return title, author


class BatchImportRequest(BaseModel):
    files: List[dict]


@router.post("/batch-import", response_model=List[BookDocumentResponse])
def batch_import_files(request: BatchImportRequest, db: Session = Depends(get_db)):
    imported_books = []
    
    for file_info in request.files:
        file_path = file_info.get('file_path')
        if not file_path or not os.path.exists(file_path):
            continue
        
        existing = db.query(BookDocument).filter(
            BookDocument.file_path == file_path
        ).first()
        
        if existing:
            continue
        
        title = file_info.get('title') or parse_filename(os.path.basename(file_path))[0]
        author = file_info.get('author')
        country_id = file_info.get('country_id')
        category_id = file_info.get('category_id')
        content_region_id = file_info.get('content_region_id')
        author_region_id = file_info.get('author_region_id')
        
        file_size = os.path.getsize(file_path)
        
        cover_image, thumbnail = generate_pdf_cover(file_path)
        
        db_book = BookDocument(
            title=title,
            author=author,
            file_path=file_path,
            file_size=file_size,
            cover_image=cover_image,
            thumbnail=thumbnail,
            country_id=country_id,
            category_id=category_id,
            content_region_id=content_region_id,
            author_region_id=author_region_id,
        )
        db.add(db_book)
        db.commit()
        db.refresh(db_book)
        
        imported_books.append(_build_book_response(db_book, db))
    
    return imported_books


@router.post("/sync-existing")
def sync_existing_files(db: Session = Depends(get_db)):
    scanned = scan_upload_folder(db)
    updated_count = 0
    
    for file_info in scanned.files:
        if file_info.already_exists and file_info.existing_book_id:
            book = db.query(BookDocument).filter(
                BookDocument.id == file_info.existing_book_id
            ).first()
            
            if book and not book.title:
                book.title = file_info.parsed_title
                if file_info.parsed_author and not book.author:
                    book.author = file_info.parsed_author
                updated_count += 1
    
    db.commit()
    
    return {
        "message": f"Updated {updated_count} existing books",
        "total_files": scanned.total_files
    }
