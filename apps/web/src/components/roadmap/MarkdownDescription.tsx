import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

interface MarkdownDescriptionProps {
  value: string
}

function safeMarkdownUrl(url: string): string | undefined {
  const trimmedUrl = url.trim()
  const protocol = trimmedUrl.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()

  if (!protocol || protocol === 'http' || protocol === 'https' || protocol === 'mailto') {
    return url
  }

  return undefined
}

export function MarkdownDescription({ value }: MarkdownDescriptionProps) {
  return (
    <div className="desc markdown-description">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={safeMarkdownUrl}
        components={{
          a: ({ href, children, ...props }) => {
            if (!href) return <>{children}</>

            const external = /^https?:/i.test(href)
            return (
              <a
                href={href}
                {...props}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  )
}
