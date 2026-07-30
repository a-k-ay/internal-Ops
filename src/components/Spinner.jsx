export default function Spinner({ large, center }) {
  const cls = `spinner${large ? ' spinner-lg' : ''}`
  if (center) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}>
      <div className={cls} />
    </div>
  )
  return <div className={cls} />
}
