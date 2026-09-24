import {DetailMissionClient} from './detail-mission-client'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <DetailMissionClient id={id}/>}
