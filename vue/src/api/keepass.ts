import service from '../utils/backend'

export const openDatabase = (params?: any) => {
  return service.post('open-database', params)
}
export const closeDatabase = () => {
  return service.post('close-database')
}
export const changeCredentials = (params?: any) => {
  return service.post('change-credentials', params)
}
export const createCredentialKey = (params?: any) => {
  return service.post('create-credential-key', params)
}
export const maintenanceDatabase = (params?: any) => {
  return service.post('maintenance-database', params)
}
export const createDatabase = (params?: any) => {
  return service.post('create-database', params)
}
export const saveDatabase = () => {
  return service.post('save-database')
}
export const checkDatabaseIsOpen = () => {
  return service.post('check-is-open')
}
export const checkDatabaseIsNotSave = () => {
  return service.post('check-is-not-save')
}
export const getMeta = () => {
  return service.post('get-meta')
}
export const getGroupTree = (params?: any) => {
  return service.post('get-group-tree', params)
}
export const getGroupEntries = (params: any) => {
  return service.post('get-group-entries', params)
}
export const getGroupEntriesDeep = (params: any) => {
  return service.post('get-group-entries-deep', params)
}
export const getEntryDetail = (params: any) => {
  return service.post('get-entry-detail', params)
}
export const updateEntry = (params: any) => {
  return service.post('update-entry', params)
}
export const updateGroup = (params: any) => {
  return service.post('update-group', params)
}
export const createEntry = (params: any) => {
  return service.post('create-entry', params)
}
export const createGroup = (params: any) => {
  return service.post('create-group', params)
}
export const removeGroup = (params: any) => {
  return service.post('remove-group', params)
}
export const removeEntry = (params: any) => {
  return service.post('remove-entry', params)
}
export const moveGroup = (params: any) => {
  return service.post('move-group', params)
}
export const moveEntry = (params: any) => {
  return service.post('move-entry', params)
}
export const getAttachment = (params: any) => {
  return service.post('get-attachment', params, {
    responseType: 'blob',
  })
}
export const removeAttachment = (params: any) => {
  return service.post('remove-attachment', params)
}

export const uploadAttachment = async (uuid: string, files: File[]) => {
  const filesData: any = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    filesData.push({
      name: file.name,
      buffer: await file.arrayBuffer(),
    })
  }

  return service.post('upload-attachment', {
    uuid,
    files: filesData,
  })
}
export const renameAttachment = (params: any) => {
  return service.post('rename-attachment', params)
}
export const searchDatabase = (params: any) => {
  return service.post('search-database', params)
}
