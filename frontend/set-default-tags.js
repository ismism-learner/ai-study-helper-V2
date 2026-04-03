// 设置默认标签历史到 localStorage
const defaultTags = ['历史', '金融', '意识形态', '数学', '哲学', '科学', '文学', '艺术', '历史历史', '心理学'];

// 检查当前 localStorage 中的数据
const currentTags = localStorage.getItem('tagHistory');
console.log('Current tagHistory:', currentTags);

// 如果没有数据，设置默认标签
if (!currentTags) {
  localStorage.setItem('tagHistory', JSON.stringify(defaultTags));
  console.log('Set default tagHistory:', defaultTags);
} else {
  console.log('Tag history already exists:', JSON.parse(currentTags));
}

// 验证设置是否成功
const updatedTags = localStorage.getItem('tagHistory');
console.log('Updated tagHistory:', updatedTags);
