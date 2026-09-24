import { DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition'
import { createRekognitionClient } from '@/lib/aws-config'

// Only these top-level Rekognition moderation categories are treated as
// grounds for rejection (explicit / violent / graphic content). Other
// categories such as Alcohol, Tobacco or Gambling are not blocked here.
const FLAGGED_CATEGORIES = new Set(['Explicit Nudity', 'Violence', 'Visually Disturbing'])
const CONFIDENCE_THRESHOLD = 80

export async function moderateImage({ bucketName, key }: { bucketName: string; key: string }): Promise<{ flagged: boolean; labels: string[] }> {
  const rekognition = createRekognitionClient()
  const result = await rekognition.send(new DetectModerationLabelsCommand({
    Image: { S3Object: { Bucket: bucketName, Name: key } },
    MinConfidence: CONFIDENCE_THRESHOLD,
  }))
  const matches = (result.ModerationLabels ?? []).filter(l =>
    (l.Confidence ?? 0) >= CONFIDENCE_THRESHOLD &&
    (FLAGGED_CATEGORIES.has(l.ParentName ?? '') || FLAGGED_CATEGORIES.has(l.Name ?? ''))
  )
  return { flagged: matches.length > 0, labels: matches.map(l => l.Name ?? '').filter(Boolean) }
}
