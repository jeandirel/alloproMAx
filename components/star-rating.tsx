'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            iconSize,
            star <= Math.round(rating)
              ? 'fill-gold text-gold'
              : 'fill-gray-200 text-gray-200'
          )}
        />
      ))}
    </div>
  )
}
