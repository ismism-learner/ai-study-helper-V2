from sqlalchemy import create_engine, text

engine = create_engine('sqlite:///./interactive_docs.db')

with engine.connect() as conn:
    try:
        conn.execute(text('ALTER TABLE book_documents ADD COLUMN theme_year_start INTEGER'))
        print('Added theme_year_start')
    except Exception as e:
        print(f'theme_year_start: {e}')
    
    try:
        conn.execute(text('ALTER TABLE book_documents ADD COLUMN theme_year_end INTEGER'))
        print('Added theme_year_end')
    except Exception as e:
        print(f'theme_year_end: {e}')
    
    try:
        conn.execute(text("ALTER TABLE book_documents ADD COLUMN theme_year_status VARCHAR DEFAULT '暂未确定'"))
        print('Added theme_year_status')
    except Exception as e:
        print(f'theme_year_status: {e}')
    
    conn.commit()

print('Migration completed!')
