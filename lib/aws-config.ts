import { S3Client } from '@aws-sdk/client-s3'
import { RekognitionClient } from '@aws-sdk/client-rekognition'
// AWS_REGION est un nom réservé par le runtime Lambda sous-jacent à Vercel : la valeur définie dans le
// dashboard Vercel n'atteint pas toujours process.env telle quelle (on observe un region="" au runtime).
// On ne dépend donc plus de la résolution automatique du SDK et on passe la région explicitement, avec
// un repli sur la région du bucket existant pour ne jamais se retrouver avec une chaîne vide.
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-west-2'
export function getBucketConfig() { return { bucketName:process.env.AWS_BUCKET_NAME??'',folderPrefix:process.env.AWS_FOLDER_PREFIX??'' } }
export function createS3Client() { return new S3Client({ region }) }
export function createRekognitionClient() { return new RekognitionClient({ region }) }
