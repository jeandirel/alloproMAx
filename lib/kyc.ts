// Pluggable KYC / IDV (identity verification) provider abstraction.
//
// Today, "badge vérifié" is decided entirely by a human administrator who
// looks at 3 uploaded files (recto/verso/casier) in the `kyc` action of
// lib/marketplace-engine.ts and clicks approve/reject. This module lets that
// decision optionally be informed by a real automated identity-verification
// vendor, while defaulting to the exact same manual-review behaviour when no
// vendor is configured (or misconfigured). A provider is only ever allowed to
// *veto* an approval (status 'refuse') — it must never be able to turn a
// non-decision into an automatic 'verifie'; getKycProvider() always falls
// back to the safe manual provider rather than failing open.

export type KycStatus = 'verifie' | 'refuse' | 'en_cours'

export interface KycDocumentRef { id: string; name: string }

export interface KycVerifyInput {
  documents: KycDocumentRef[]
  professionalName: string
}

export interface KycVerifyResult {
  status: KycStatus
  reason?: string
  providerRef?: string
}

export interface KycProvider {
  verifyDocuments(input: KycVerifyInput): Promise<KycVerifyResult>
}

/**
 * No-op passthrough preserving today's behaviour: a human admin decides.
 * Never returns 'verifie' or 'refuse' on its own.
 */
export const manualKycProvider: KycProvider = {
  async verifyDocuments(): Promise<KycVerifyResult> {
    return { status: 'en_cours' }
  }
}

// ---------------------------------------------------------------------------
// Onfido adapter (https://documentation.onfido.com/)
//
// NON-FUNCTIONAL until ONFIDO_API_TOKEN holds a real Onfido API token. Even
// then, this adapter does not yet fetch document bytes: our documents live in
// S3 (see prisma model UploadedAsset.cloud_storage_path and the client built
// in lib/aws-config.ts's createS3Client()/getBucketConfig(), used the same
// way app/api/files/route.ts streams objects out via GetObjectCommand). To
// finish this integration, resolve each KycDocumentRef.id to its
// UploadedAsset row, download the bytes with
// `storage.send(new GetObjectCommand({Bucket, Key: asset.cloud_storage_path}))`,
// and POST that buffer as multipart/form-data to Onfido's /documents
// endpoint below instead of the omitted upload step.
// ---------------------------------------------------------------------------
export const onfidoKycProvider: KycProvider = {
  async verifyDocuments(input: KycVerifyInput): Promise<KycVerifyResult> {
    const token = process.env.ONFIDO_API_TOKEN
    if (!token) return { status: 'en_cours', reason: 'Onfido non configuré (ONFIDO_API_TOKEN manquant) — vérification manuelle requise.' }
    try {
      const base = 'https://api.onfido.com/v3.6'
      const authHeaders = { Authorization: `Token token=${token}`, 'Content-Type': 'application/json' }
      const [firstName, ...rest] = input.professionalName.trim().split(/\s+/)
      const lastName = rest.join(' ') || firstName || 'Professionnel'

      // 1) Create an applicant. Real request/response shape per Onfido docs.
      const applicantRes = await fetch(`${base}/applicants`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ first_name: firstName || 'Professionnel', last_name: lastName })
      })
      if (!applicantRes.ok) throw new Error(`Onfido applicants ${applicantRes.status}`)
      const applicant = await applicantRes.json() as { id: string }

      // 2) Upload each document (multipart/form-data: applicant_id, type, file).
      // Intentionally not implemented here: requires fetching bytes from S3
      // first (see file header comment above). Without uploaded documents,
      // Onfido cannot run a document/facial-similarity check, so we cannot
      // proceed past applicant creation in this stub.
      // for (const doc of input.documents) { /* fetch bytes from S3, then: */
      //   await fetch(`${base}/documents`, { method:'POST', headers:{Authorization:authHeaders.Authorization}, body: formDataWithApplicantIdTypeAndFile })
      // }

      // 3) Create a check once documents are uploaded:
      // const checkRes = await fetch(`${base}/checks`, { method:'POST', headers: authHeaders,
      //   body: JSON.stringify({ applicant_id: applicant.id, report_names: ['document','facial_similarity_photo'] }) })
      // const check = await checkRes.json() as { id: string; status: string; result?: string }
      // Map check.result: 'clear' -> 'verifie', 'consider' | 'rejected' -> 'refuse', otherwise 'en_cours' (still processing / needs webhook).

      return {
        status: 'en_cours',
        reason: 'Intégration Onfido incomplète (téléversement des documents et vérification non finalisés) — vérification manuelle requise.',
        providerRef: applicant.id
      }
    } catch (e) {
      console.error('[kyc] Onfido', e)
      return { status: 'en_cours', reason: 'Erreur du fournisseur Onfido — vérification manuelle requise.' }
    }
  }
}

// ---------------------------------------------------------------------------
// Smile Identity adapter (https://docs.smileidentity.com/)
//
// NON-FUNCTIONAL until SMILE_IDENTITY_PARTNER_ID and SMILE_IDENTITY_API_KEY
// hold real Smile ID credentials. Like the Onfido adapter above, document
// bytes are not fetched from S3 or attached here — see the same
// UploadedAsset / lib/aws-config.ts note in the Onfido adapter's comment.
// Smile ID's "upload" job flow additionally requires zipping the images and
// PUTing them to a pre-signed URL returned by the /upload call, then polling
// /job_status (or a webhook) for the final result — none of which is wired up
// in this stub.
// ---------------------------------------------------------------------------
export const smileIdentityKycProvider: KycProvider = {
  async verifyDocuments(input: KycVerifyInput): Promise<KycVerifyResult> {
    const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID
    const apiKey = process.env.SMILE_IDENTITY_API_KEY
    if (!partnerId || !apiKey) return { status: 'en_cours', reason: 'Smile Identity non configuré (identifiants manquants) — vérification manuelle requise.' }
    try {
      const { createHmac } = await import('crypto')
      const timestamp = new Date().toISOString()
      // Smile ID request signing per https://docs.smileidentity.com/further-information/faqs/security/signature:
      // signature = base64(HMAC-SHA256(timestamp + partner_id + 'sid_request', api_key))
      const signature = createHmac('sha256', apiKey).update(`${timestamp}${partnerId}sid_request`).digest('base64')
      const jobId = `kyc-${Date.now()}`

      // Job type 6 = "Document Verification" in Smile ID's job_type enum.
      // Real shape per https://docs.smileidentity.com/products/for-individuals-kyc/document-verification :
      const uploadRes = await fetch('https://api.smileidentity.com/v1/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: partnerId,
          signature,
          timestamp,
          partner_params: { user_id: input.professionalName, job_id: jobId, job_type: 6 },
          // images: intentionally empty — filling this in requires downloading
          // each document's bytes from S3 (UploadedAsset.cloud_storage_path via
          // createS3Client()/GetObjectCommand, see lib/aws-config.ts) and
          // base64-encoding them as { image_type_id, image } entries.
          images: [] as { image_type_id: number; image: string }[]
        })
      })
      if (!uploadRes.ok) throw new Error(`Smile Identity upload ${uploadRes.status}`)
      const upload = await uploadRes.json() as { upload_url?: string; smile_job_id?: string; ref_id?: string }

      // Real flow would then zip the images, PUT them to upload.upload_url,
      // and poll POST /job_status (or receive a callback) for the final
      // ResultCode / ResultText to map onto 'verifie' | 'refuse'.

      return {
        status: 'en_cours',
        reason: 'Intégration Smile Identity incomplète (téléversement des images et suivi du job non finalisés) — vérification manuelle requise.',
        providerRef: upload.smile_job_id || upload.ref_id
      }
    } catch (e) {
      console.error('[kyc] Smile Identity', e)
      return { status: 'en_cours', reason: 'Erreur du fournisseur Smile Identity — vérification manuelle requise.' }
    }
  }
}

/**
 * Reads KYC_PROVIDER ('onfido' | 'smile_identity' | 'manual', case-insensitive).
 * Falls back to manualKycProvider when unset, unrecognized, or when the
 * selected provider's required credentials are missing — this must never
 * fail open into an automatic approval.
 */
export function getKycProvider(): KycProvider {
  const selected = (process.env.KYC_PROVIDER || 'manual').trim().toLowerCase()
  if (selected === 'onfido') {
    if (!process.env.ONFIDO_API_TOKEN) { console.warn('[kyc] KYC_PROVIDER=onfido mais ONFIDO_API_TOKEN est manquant — repli sur la vérification manuelle.'); return manualKycProvider }
    return onfidoKycProvider
  }
  if (selected === 'smile_identity') {
    if (!process.env.SMILE_IDENTITY_PARTNER_ID || !process.env.SMILE_IDENTITY_API_KEY) { console.warn('[kyc] KYC_PROVIDER=smile_identity mais les identifiants sont manquants — repli sur la vérification manuelle.'); return manualKycProvider }
    return smileIdentityKycProvider
  }
  return manualKycProvider
}
