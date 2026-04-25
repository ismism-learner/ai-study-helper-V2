import sqlite3

conn = sqlite3.connect(r'c:\Users\haokun\Documents\trae_projects\ai study helper V2\backend\interactive_docs.db')
cursor = conn.cursor()

# 检查节点和边数量
cursor.execute("SELECT COUNT(*) FROM knowledge_nodes")
node_count = cursor.fetchone()[0]
cursor.execute("SELECT COUNT(*) FROM knowledge_edges")
edge_count = cursor.fetchone()[0]
print(f'节点总数: {node_count}')
print(f'边总数: {edge_count}')

# 检查索引
cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_nodes'")
node_indexes = cursor.fetchall()
print(f'\nknowledge_nodes 索引: {[i[0] for i in node_indexes]}')

cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_edges'")
edge_indexes = cursor.fetchall()
print(f'knowledge_edges 索引: {[i[0] for i in edge_indexes]}')

# 检查 book_title 索引
cursor.execute("PRAGMA index_list('knowledge_nodes')")
print(f'\nknowledge_nodes 索引详情:')
for idx in cursor.fetchall():
    print(f'  {idx}')

cursor.execute("PRAGMA index_list('knowledge_edges')")
print(f'\nknowledge_edges 索引详情:')
for idx in cursor.fetchall():
    print(f'  {idx}')

conn.close()
