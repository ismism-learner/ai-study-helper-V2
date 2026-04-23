import sqlite3

conn = sqlite3.connect(r'c:\Users\haokun\Documents\trae_projects\ai study helper V2\backend\interactive_docs.db')
cursor = conn.cursor()

# 检查所有 QuickSummary 节点
cursor.execute("SELECT id, name, text_position, chapter_index FROM knowledge_nodes WHERE node_type = 'QuickSummary' ORDER BY text_position")
nodes = cursor.fetchall()
print('QuickSummary 节点（按位置排序）:')
for node in nodes:
    print(f'  ID: {node[0][:8]}..., Name: {node[1]}, Position: {node[2]}, ChapterIndex: {node[3]}')

# 检查所有边
cursor.execute("SELECT e.edge_type, n1.name as source_name, n2.name as target_name FROM knowledge_edges e JOIN knowledge_nodes n1 ON e.source_id = n1.id JOIN knowledge_nodes n2 ON e.target_id = n2.id WHERE e.edge_type IN ('CHAPTER_SEQUENCE', 'SECTION_SEQUENCE')")
edges = cursor.fetchall()
print('\n章节连接边:')
for edge in edges:
    print(f'  {edge[1]} --[{edge[0]}]--> {edge[2]}')

conn.close()
