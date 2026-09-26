export const dynamic='force-dynamic'
import {auth} from '@/auth'
import {prisma} from '@/lib/prisma'
import {createS3Client,getBucketConfig} from '@/lib/aws-config'
import {PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'
import {moderateImage} from '@/lib/moderation'
import {NextResponse} from 'next/server'
import {randomUUID} from 'crypto'
const storage=createS3Client()
// WebP retiré : Rekognition DetectModerationLabels ne le supporte pas, ce qui laissait passer
// ces fichiers sans aucune modération (faux-négatif silencieux, pas juste une panne).
const allowed=['image/jpeg','image/png','application/pdf']
// Le type déclaré par le client (et l'en-tête envoyé au PUT S3) n'est jamais fiable : un client
// malveillant peut déclarer "application/pdf" pour faire passer une image non modérée. On ne
// décide donc jamais d'exempter un fichier de modération sur la seule foi du type déclaré —
// on vérifie la signature binaire réellement stockée.
async function sniffStoredType(bucketName:string,key:string):Promise<string|null>{
 const res=await storage.send(new GetObjectCommand({Bucket:bucketName,Key:key,Range:'bytes=0-11'}))
 const bytes=await res.Body?.transformToByteArray();if(!bytes)return null
 const buf=Buffer.from(bytes)
 if(buf[0]===0xFF&&buf[1]===0xD8&&buf[2]===0xFF)return 'image/jpeg'
 if(buf[0]===0x89&&buf[1]===0x50&&buf[2]===0x4E&&buf[3]===0x47)return 'image/png'
 if(buf.subarray(0,5).toString('latin1')==='%PDF-')return 'application/pdf'
 return null
}
export async function POST(req:Request){
 const session=await auth();if(!session?.user?.id)return NextResponse.json({error:'Connexion requise.'},{status:401})
 try{
 const b=await req.json();const {bucketName,folderPrefix}=getBucketConfig()
 if(b.complete){
 const file=await prisma.uploadedAsset.findFirst({where:{id:b.id,userId:session.user.id}});if(!file)throw new Error('Fichier introuvable.')
 const head=await storage.send(new HeadObjectCommand({Bucket:bucketName,Key:file.cloud_storage_path}))
 if(head.ContentLength!==file.size || head.ContentType!==file.contentType)throw new Error('Le fichier reçu ne correspond pas au fichier déclaré.')
 const actualType=await sniffStoredType(bucketName,file.cloud_storage_path)
 if(actualType!==file.contentType){
 await storage.send(new DeleteObjectCommand({Bucket:bucketName,Key:file.cloud_storage_path}))
 await prisma.uploadedAsset.delete({where:{id:file.id}})
 return NextResponse.json({error:'Le contenu du fichier ne correspond pas à son type déclaré.'},{status:422})
 }
 if(file.contentType!=='application/pdf'){
 try{
 const {flagged}=await moderateImage({bucketName,key:file.cloud_storage_path})
 if(flagged){
 await storage.send(new DeleteObjectCommand({Bucket:bucketName,Key:file.cloud_storage_path}))
 await prisma.uploadedAsset.delete({where:{id:file.id}})
 return NextResponse.json({error:'Cette image a été rejetée par la modération automatique de contenu.'},{status:422})
 }
 }catch(modErr){
 // Panne infra (identifiants AWS absents en local, réseau, etc.) : on ne bloque pas l'utilisateur pour une erreur qui n'est pas de son fait ;
 // seule une détection positive avérée (ci-dessus) doit bloquer le fichier. Fail-open sur la panne, fail-closed sur la détection.
 console.error('Modération Rekognition indisponible',modErr)
 }
 }
 await prisma.uploadedAsset.update({where:{id:file.id},data:{complete:true}});return NextResponse.json({id:file.id,name:file.name})
 }
 if(typeof b.name!=='string'||b.name.length>180||!allowed.includes(b.contentType)||!Number.isInteger(b.size)||b.size<1||b.size>10*1024*1024)throw new Error('JPEG, PNG, WebP ou PDF uniquement, 10 Mo maximum.')
 const count=await prisma.uploadedAsset.count({where:{userId:session.user.id}});if(count>=100)throw new Error('Limite de 100 fichiers atteinte pour cette démonstration.')
 const cloud_storage_path=`${folderPrefix}uploads/${Date.now()}-allopro-${randomUUID()}`
 const row=await prisma.uploadedAsset.create({data:{userId:session.user.id,name:b.name,contentType:b.contentType,size:b.size,cloud_storage_path,isPublic:false}})
 const uploadUrl=await getSignedUrl(storage,new PutObjectCommand({Bucket:bucketName,Key:cloud_storage_path,ContentType:b.contentType,ContentLength:b.size}),{expiresIn:300})
 return NextResponse.json({id:row.id,uploadUrl})
 }catch(e){console.error('Fichier Allo Pro',e);return NextResponse.json({error:e instanceof Error?e.message:'Téléversement impossible.'},{status:400})}
}
export async function GET(req:Request){
 const session=await auth();if(!session?.user?.id)return NextResponse.json({error:'Connexion requise.'},{status:401})
 try{const params=new URL(req.url).searchParams;const id=params.get('id')||'';const f=await prisma.uploadedAsset.findFirst({where:{id,userId:session.user.id,complete:true}});if(!f)return NextResponse.json({error:'Fichier introuvable.'},{status:404})
 const url=await getSignedUrl(storage,new GetObjectCommand({Bucket:getBucketConfig().bucketName,Key:f.cloud_storage_path,ResponseContentDisposition:params.get('view')==='1'&&f.contentType.startsWith('image/')?'inline':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`}),{expiresIn:120})
 return NextResponse.redirect(url,302)
 }catch(e){console.error('Lecture fichier',e);return NextResponse.json({error:'Fichier indisponible.'},{status:500})}
}
