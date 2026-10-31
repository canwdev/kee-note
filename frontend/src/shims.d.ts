import {ElMessage, ElNotification} from 'element-plus'
import NProgress from 'nprogress'

declare global {
  interface Window {
    $message: typeof ElMessage
    $dialog: any
    $notification: typeof ElNotification
    $loadingBar: NProgress
  }
}
