'use client'
import Image,{type ImageProps} from 'next/image'
import {useState} from 'react'
export default function SmartImage(props:ImageProps){const [failed,setFailed]=useState(false);return <Image {...props} unoptimized={typeof props.src==='string'&&props.src.startsWith('/api/files')?true:props.unoptimized} src={failed||!props.src?'/avatar-fallback-v1.svg':props.src} onError={e=>{setFailed(true);props.onError?.(e)}}/>}
