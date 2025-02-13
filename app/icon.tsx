import { ImageResponse } from 'next/og'
import React from 'react'

// Route segment config
export const runtime = 'edge'

// Image metadata
export const size = {
  width: 180,
  height: 180
}

// Image generation
export default async function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 160,
          background: '#1a1b26',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
        }}
      >
        W
      </div>
    ),
    {
      ...size,
    }
  )
}
