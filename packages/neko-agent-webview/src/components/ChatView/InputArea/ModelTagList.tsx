interface ModelTagListProps {
  readonly tags: readonly string[];
  readonly className: string;
}

export function ModelTagList({ tags, className }: ModelTagListProps) {
  if (tags.length === 0) return null;

  return (
    <span className={`agent-model-tag-list ${className}`} title={tags.join(' / ')}>
      {tags.map((tag) => (
        <span key={tag} className="agent-model-tag">
          {tag}
        </span>
      ))}
    </span>
  );
}
