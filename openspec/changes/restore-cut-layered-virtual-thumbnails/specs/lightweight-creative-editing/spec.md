# lightweight-creative-editing Specification

## MODIFIED Requirements

### Requirement: Cut renders derived Clip content without owning media IO

The Cut Webview SHALL render Host-derived thumbnail and waveform presentation
state without reading workspace media or persisting derived data into OTIO.

#### Scenario: Render density-layered virtual Video thumbnails

- **WHEN** a Video Clip intersects the timeline viewport
- **THEN** the Webview selects one stable thumbnail density layer from the
  current zoom
- **AND** requests only missing time tiles intersecting the viewport plus
  bounded overscan
- **AND** the Host maps every tile to the Clip source range and generates it
  through the current `FrameCapturePort`
- **AND** the Webview positions each returned tile at its timeline offset rather
  than stretching a capped Clip-wide image strip

#### Scenario: Scroll within one density layer

- **WHEN** the viewport scrolls while zoom remains in the same density layer
- **THEN** already cached intersecting tile identities are reused
- **AND** only newly exposed missing tile identities are requested
- **AND** the number of planned and in-flight tiles remains bounded independently
  of the complete Clip duration

#### Scenario: Change thumbnail density

- **WHEN** timeline zoom crosses a thumbnail density boundary
- **THEN** the planner requests the visible tiles for the new layer
- **AND** results from another layer are not stretched or rendered as the current
  layer
- **AND** zoom changes inside one layer do not invalidate every tile

#### Scenario: Thumbnail generation is superseded or partially fails

- **WHEN** a newer request, document revision, or panel disposal supersedes a
  thumbnail batch
- **THEN** the Host aborts the old work and the Webview discards stale results
- **AND** a damaged tile is reported at tile scope without invalidating valid
  neighboring tiles
- **AND** Cut does not retry through an Engine or software-transcode fallback

#### Scenario: Render Audio waveform

- **WHEN** a visible Audio Clip is projected for the current revision
- **THEN** the Webview requests bounded waveform data from the Host
- **AND** stale-revision results are ignored and failures are shown explicitly
  rather than replaced with fabricated values
