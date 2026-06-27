import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob'

const ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT || ''
const ACCOUNT_KEY  = process.env.AZURE_STORAGE_KEY || ''
const CONTAINER    = process.env.AZURE_STORAGE_CONTAINER || 'receipts'

function getClient() {
  if (!ACCOUNT_NAME || !ACCOUNT_KEY) throw new Error('Azure Storage not configured')
  const cred = new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY)
  return new BlobServiceClient(`https://${ACCOUNT_NAME}.blob.core.windows.net`, cred)
}

export async function uploadBuffer(blobName: string, buffer: Buffer, contentType: string): Promise<void> {
  const client = getClient()
  const container = client.getContainerClient(CONTAINER)
  await container.createIfNotExists()
  const blob = container.getBlockBlobClient(blobName)
  await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } })
}

export async function getSignedUrl(blobName: string, expirySeconds = 300): Promise<string> {
  const cred = new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY)
  const expiry = new Date(Date.now() + expirySeconds * 1000)
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: expiry,
    },
    cred
  )
  return `https://${ACCOUNT_NAME}.blob.core.windows.net/${CONTAINER}/${blobName}?${sas}`
}

export async function deleteBlob(blobName: string): Promise<void> {
  const client = getClient()
  const blob = client.getContainerClient(CONTAINER).getBlockBlobClient(blobName)
  await blob.deleteIfExists()
}
