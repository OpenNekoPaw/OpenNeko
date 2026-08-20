# Design

`@neko/content` remains the owner of the `openneko.document` contract and `ContentLocator` schema. The DSH plugin publishes a structured schema for the already-canonical decoder:

```json
{
  "source": {
    "file": {
      "authority": "workspace",
      "path": "neko/assets/Blame/book.epub"
    }
  }
}
```

The path is still a workspace-relative path. A managed `neko/assets/<library>` symlink is authorized by the existing workspace path guard, so the document runtime and decoder do not need a media-library branch. The canonical chain remains:

```text
DSH schema -> document decoder -> ACP Host adapter -> exact Workspace grant
  -> ContentReadService workspace-file authorization -> document decoder
```

The schema will allow only the current operation-specific fields. The decoder remains strict and is the owning validation boundary; unsupported legacy shapes continue to fail visibly.
