import { S3Client } from '@aws-sdk/client-s3'
import { RekognitionClient } from '@aws-sdk/client-rekognition'
export function getBucketConfig() { return { bucketName:process.env.AWS_BUCKET_NAME??'',folderPrefix:process.env.AWS_FOLDER_PREFIX??'' } }
export function createS3Client() { return new S3Client({}) }
export function createRekognitionClient() { return new RekognitionClient({}) }
