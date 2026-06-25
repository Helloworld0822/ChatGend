import * as React from 'react'

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'md-dialog': any
        'md-outlined-text-field': any
        'md-filled-text-field': any
        'md-filled-button': any
        'md-outlined-button': any
        'md-list': any
        'md-list-item': any
        'md-icon': any
      }
    }
  }
}
