from sqlalchemy import create_engine, text

engine = create_engine('sqlite:///./interactive_docs.db')

with engine.connect() as conn:
    try:
        conn.execute(text('ALTER TABLE time_periods ADD COLUMN parent_id VARCHAR'))
        print('Added parent_id')
    except Exception as e:
        print(f'parent_id: {e}')
    
    try:
        conn.execute(text('ALTER TABLE time_periods ADD COLUMN description TEXT'))
        print('Added description')
    except Exception as e:
        print(f'description: {e}')
    
    conn.commit()

print('Migration completed!')
