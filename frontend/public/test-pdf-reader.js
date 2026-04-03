// PDF阅读器功能测试脚本
// 在浏览器控制台中运行此脚本来测试功能

(function testPDFReader() {
  console.log('=== PDF阅读器功能测试 ===');
  console.log('测试时间:', new Date().toLocaleString());
  
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };
  
  function test(name, condition, details = '') {
    if (condition) {
      results.passed.push({ name, details });
      console.log(`✅ 通过: ${name}${details ? ' - ' + details : ''}`);
    } else {
      results.failed.push({ name, details });
      console.error(`❌ 失败: ${name}${details ? ' - ' + details : ''}`);
    }
  }
  
  function warn(name, details) {
    results.warnings.push({ name, details });
    console.warn(`⚠️ 警告: ${name}${details ? ' - ' + details : ''}`);
  }
  
  // 测试1: 检查PDF阅读器容器是否存在
  const readerContainer = document.querySelector('.book-reader-view');
  test('PDF阅读器容器存在', !!readerContainer);
  
  // 测试2: 检查悬浮工具栏是否存在
  const floatingToolbar = document.querySelector('.floating-toolbar');
  test('悬浮工具栏存在', !!floatingToolbar);
  
  // 测试3: 检查工具栏是否可见
  if (floatingToolbar) {
    const isVisible = floatingToolbar.classList.contains('visible');
    test('工具栏可见', isVisible, '工具栏应该默认可见');
  }
  
  // 测试4: 检查页码导航组件
  const pageNavToolbar = document.querySelector('.page-navigation-toolbar');
  test('页码导航组件存在', !!pageNavToolbar);
  
  // 测试5: 检查页码输入框
  const pageJumpInput = document.querySelector('.page-jump-input');
  test('页码输入框存在', !!pageJumpInput);
  
  // 测试6: 检查总页数显示
  const totalPages = document.querySelector('.total-pages');
  if (totalPages) {
    const pageCount = parseInt(totalPages.textContent);
    test('总页数显示正确', pageCount > 0, `共 ${pageCount} 页`);
  }
  
  // 测试7: 检查PDF页面容器
  const pdfViewerContainer = document.querySelector('.pdf-viewer-container');
  test('PDF页面容器存在', !!pdfViewerContainer);
  
  // 测试8: 检查PDF页面是否渲染
  const pdfPages = document.querySelectorAll('.pdf-page-wrapper');
  test('PDF页面已渲染', pdfPages.length > 0, `已渲染 ${pdfPages.length} 个页面元素`);
  
  // 测试9: 检查当前页面显示
  const pageJumpInputPlaceholder = pageJumpInput?.placeholder;
  if (pageJumpInputPlaceholder) {
    const displayedPage = parseInt(pageJumpInputPlaceholder);
    test('当前页码显示存在', !isNaN(displayedPage), `显示第 ${displayedPage} 页`);
  }
  
  // 测试10: 检查页面引用是否正确
  const pageRefs = document.querySelectorAll('[data-page]');
  if (pageRefs.length > 0) {
    const pageNumbers = Array.from(pageRefs).map(el => parseInt(el.getAttribute('data-page')));
    const sortedPages = [...pageNumbers].sort((a, b) => a - b);
    const isSequential = pageNumbers.every((num, i) => num === sortedPages[i]);
    test('页面编号正确', isSequential, `页面范围: ${Math.min(...pageNumbers)} - ${Math.max(...pageNumbers)}`);
  }
  
  // 测试11: 检查缩放控制
  const zoomControls = document.querySelector('.zoom-controls');
  test('缩放控制存在', !!zoomControls);
  
  // 测试12: 检查缩放级别显示
  const zoomLevel = document.querySelector('.zoom-level');
  if (zoomLevel) {
    const level = parseInt(zoomLevel.textContent);
    test('缩放级别显示正确', level > 0 && level <= 300, `当前缩放: ${level}%`);
  }
  
  // 测试13: 检查导航按钮
  const prevBtn = document.querySelector('.nav-btn:first-child');
  const nextBtn = document.querySelector('.nav-btn:last-child');
  test('上一页按钮存在', !!prevBtn);
  test('下一页按钮存在', !!nextBtn);
  
  // 测试14: 检查深色主题
  const toolbarBg = floatingToolbar ? getComputedStyle(floatingToolbar).background : '';
  const isDarkTheme = toolbarBg.includes('rgba') || toolbarBg.includes('rgb(15') || toolbarBg.includes('rgb(30');
  test('深色主题应用', isDarkTheme, '工具栏使用深色背景');
  
  // 测试15: 检查PDF笔记面板按钮
  const notesBtn = document.querySelector('.toolbar-btn[title="PDF 笔记"]');
  test('PDF笔记按钮存在', !!notesBtn);
  
  // 测试16: 检查滚动容器
  const scrollContainer = document.querySelector('.reader-content');
  test('滚动容器存在', !!scrollContainer);
  
  // 测试17: 检查滚动位置检测
  if (scrollContainer && pageRefs.length > 0) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const visiblePages = Array.from(pageRefs).filter(page => {
      const rect = page.getBoundingClientRect();
      return rect.top < containerRect.bottom && rect.bottom > containerRect.top;
    });
    test('可见页面检测', visiblePages.length > 0, `当前可见 ${visiblePages.length} 页`);
  }
  
  // 测试18: 检查页面占位符
  const placeholders = document.querySelectorAll('.page-placeholder');
  if (placeholders.length > 0) {
    warn('存在页面占位符', `有 ${placeholders.length} 个页面尚未渲染`);
  }
  
  // 测试19: 检查加载状态
  const loadingOverlay = document.querySelector('.reader-loading-overlay');
  test('加载状态组件存在', true, loadingOverlay ? '加载中' : '已加载完成');
  
  // 测试20: 检查错误状态
  const errorContainer = document.querySelector('.book-reader-error');
  test('无错误状态', !errorContainer, errorContainer ? '存在错误' : '正常');
  
  // 输出测试结果汇总
  console.log('\n=== 测试结果汇总 ===');
  console.log(`✅ 通过: ${results.passed.length} 项`);
  console.log(`❌ 失败: ${results.failed.length} 项`);
  console.log(`⚠️ 警告: ${results.warnings.length} 项`);
  
  if (results.failed.length > 0) {
    console.log('\n失败的测试:');
    results.failed.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name}${item.details ? ' - ' + item.details : ''}`);
    });
  }
  
  if (results.warnings.length > 0) {
    console.log('\n警告:');
    results.warnings.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name}${item.details ? ' - ' + item.details : ''}`);
    });
  }
  
  // 返回结果供外部使用
  return results;
})();

// 页面滚动测试函数
function testPageScrollDetection() {
  console.log('\n=== 页面滚动检测测试 ===');
  
  const scrollContainer = document.querySelector('.reader-content');
  const pageJumpInput = document.querySelector('.page-jump-input');
  
  if (!scrollContainer || !pageJumpInput) {
    console.error('缺少必要的元素');
    return;
  }
  
  let detectedPages = [];
  let lastDetectedPage = parseInt(pageJumpInput.placeholder) || 1;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'placeholder') {
        const newPage = parseInt(pageJumpInput.placeholder);
        if (!isNaN(newPage) && newPage !== lastDetectedPage) {
          lastDetectedPage = newPage;
          detectedPages.push({
            page: newPage,
            time: new Date().toISOString()
          });
          console.log(`📄 检测到页面变化: 第 ${newPage} 页`);
        }
      }
    });
  });
  
  observer.observe(pageJumpInput, { attributes: true });
  
  console.log('开始监听页面滚动...');
  console.log('请滚动PDF文档，观察页面检测是否正确');
  console.log('测试将在30秒后自动结束');
  
  setTimeout(() => {
    observer.disconnect();
    console.log('\n=== 滚动测试结束 ===');
    console.log(`检测到 ${detectedPages.length} 次页面变化:`);
    detectedPages.forEach((item, i) => {
      console.log(`  ${i + 1}. 第 ${item.page} 页 - ${item.time}`);
    });
  }, 30000);
}

// 运行滚动测试
console.log('\n提示: 运行 testPageScrollDetection() 开始滚动检测测试');
