import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadFiles, uploadFolder } from '../services/api'

interface FileUploaderProps {
  onFilesUploaded: (filePaths: string[], files: any[]) => void
  onUploadingChange?: (uploading: boolean) => void
}

export default function FileUploader({ onFilesUploaded, onUploadingChange }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false)

  const setUploadingState = (value: boolean) => {
    setUploading(value)
    onUploadingChange?.(value)
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    setUploadingState(true)
    try {
      // Normalise: forward slashes, strip any leading slash.
      // webkitGetAsEntry sets file.path = entry.fullPath which is always "/folder/file.txt".
      // The leading slash causes parts[0] === '' and breaks folder detection.
      const getRelPath = (f: File) =>
        ((f as any).path || (f as any).webkitRelativePath || '')
          .replace(/\\/g, '/')
          .replace(/^\/+/, '')

      // A folder-drop file has a real directory as its first path segment (not '.' or '')
      // Regular file drops get path like './filename.tgz' — first segment is '.' → not a folder
      const isFolderFile = (f: File) => {
        const parts = getRelPath(f).split('/')
        return parts.length >= 2 && parts[0] !== '' && parts[0] !== '.'
      }

      const folderFiles = acceptedFiles.filter(isFolderFile)
      const regularFiles = acceptedFiles.filter(f => !isFolderFile(f))

      const allPaths: string[] = []
      const allDisplay: any[] = []

      // Group folder files by their root folder name and upload each group
      if (folderFiles.length > 0) {
        const groups = new Map<string, File[]>()
        for (const f of folderFiles) {
          const root = getRelPath(f).split('/')[0]
          if (!groups.has(root)) groups.set(root, [])
          groups.get(root)!.push(f)
        }
        for (const [folderName, files] of groups) {
          const result = await uploadFolder(files)
          allPaths.push(...result.paths)
          allDisplay.push({ name: folderName, size: files.reduce((s, f) => s + f.size, 0) })
        }
      }

      // Upload regular archive files (.tgz, .tgz.p7m, etc.) as a batch
      if (regularFiles.length > 0) {
        const result = await uploadFiles(regularFiles)
        allPaths.push(...result.paths)
        allDisplay.push(...regularFiles)
      }

      onFilesUploaded(allPaths, allDisplay)
    } catch (error: any) {
      console.error('Upload failed:', error)
      const msg = error?.response?.data?.detail || error?.message || String(error)
      alert(`Upload failed: ${msg}\n\nMake sure the backend server is running on port 8000.`)
    } finally {
      setUploadingState(false)
    }
  }, [onFilesUploaded])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: true,
    useFsAccessApi: false,  // enables webkitGetAsEntry so folder drops populate webkitRelativePath
  })

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`
          border-4 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive ? 'border-solace-green bg-solace-green-50' : 'border-gray-300 hover:border-solace-green'}
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} disabled={uploading} />

        {uploading ? (
          <div className="flex items-center justify-center gap-3">
            <svg className="animate-spin h-6 w-6 text-solace-green" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-xl text-solace-green">Uploading...</p>
          </div>
        ) : isDragActive ? (
          <p className="text-xl text-solace-green">Drop here...</p>
        ) : (
          <>
            <p className="text-xl text-gray-700 mb-2">
              Drag & drop gather-diagnostics files or folders here
            </p>
            <p className="text-gray-500">or click to browse</p>
          </>
        )}
      </div>
    </div>
  )
}
