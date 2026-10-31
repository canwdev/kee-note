/** 通过临时 <a download> 触发浏览器下载 */
export const aLinkDownload = (src: string, name?: string) => {
  try {
    if ('download' in document.createElement('a')) {
      const a = document.createElement('a')
      if (name) a.download = name
      a.style.display = 'none'
      a.href = src
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(a.href) // 释放URL 对象
      document.body.removeChild(a)
    } else {
      const elemIF = document.createElement('iframe')
      elemIF.src = src
      elemIF.style.display = 'none'
      document.body.appendChild(elemIF)
    }
  } catch (e) {
    console.error(e)
    window.open(src)
  }
}
