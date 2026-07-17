use super::{Element, ElementType, Timeline, Track};

impl Timeline {
    // ---- P0: apply methods ----

    pub(super) fn apply_element_update(
        &mut self,
        payload: &super::super::operations::ElementUpdatePayload,
    ) -> crate::error::Result<()> {
        let element = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .and_then(|t| t.elements.iter_mut().find(|e| e.id == payload.element_id))
            .ok_or_else(|| {
                crate::error::Error::Other(format!(
                    "Element not found: track={}, element={}",
                    payload.track_id, payload.element_id
                ))
            })?;

        let u = &payload.updates;
        if let Some(v) = u.start_time {
            element.start_time = v;
        }
        if let Some(v) = u.duration {
            element.duration = v;
        }
        if let Some(v) = u.trim_start {
            element.trim_start = v;
        }
        if let Some(v) = u.trim_end {
            element.trim_end = v;
        }
        if let Some(v) = u.opacity {
            element.opacity = v;
        }
        if let Some(v) = u.muted {
            element.muted = v;
        }
        if let Some(v) = u.hidden {
            element.hidden = v;
        }
        if let Some(v) = u.locked {
            element.locked = v;
        }
        if let Some(ref v) = u.name {
            element.name = v.clone();
        }
        if let Some(ref t) = u.transform {
            element.transform = t.clone();
        }
        if let Some(ref bm) = u.blend_mode {
            element.blend_mode = super::super::operations::parse_blend_mode(bm);
        }
        if let Some(ref effects) = u.effects {
            element.effects = effects.clone();
        }

        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_track_toggle(
        &mut self,
        payload: &super::super::operations::TrackTogglePayload,
    ) -> crate::error::Result<()> {
        let track = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .ok_or_else(|| {
                crate::error::Error::Other(format!("Track not found: {}", payload.track_id))
            })?;

        match payload.field.as_str() {
            "muted" => track.muted = !track.muted,
            "locked" => track.locked = !track.locked,
            "hidden" => track.hidden = !track.hidden,
            other => {
                return Err(crate::error::Error::Other(format!(
                    "Unknown toggle field: {}",
                    other
                )))
            }
        }
        Ok(())
    }

    pub(super) fn apply_element_toggle(
        &mut self,
        payload: &super::super::operations::ElementTogglePayload,
    ) -> crate::error::Result<()> {
        let element = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .and_then(|t| t.elements.iter_mut().find(|e| e.id == payload.element_id))
            .ok_or_else(|| {
                crate::error::Error::Other(format!(
                    "Element not found: track={}, element={}",
                    payload.track_id, payload.element_id
                ))
            })?;

        match payload.field.as_str() {
            "muted" => element.muted = !element.muted,
            "hidden" => element.hidden = !element.hidden,
            "locked" => element.locked = !element.locked,
            other => {
                return Err(crate::error::Error::Other(format!(
                    "Unknown toggle field: {}",
                    other
                )))
            }
        }
        Ok(())
    }

    // ---- P1: apply methods ----

    pub(super) fn apply_track_update(
        &mut self,
        payload: &super::super::operations::TrackUpdatePayload,
    ) -> crate::error::Result<()> {
        let track = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .ok_or_else(|| {
                crate::error::Error::Other(format!("Track not found: {}", payload.track_id))
            })?;

        let u = &payload.updates;
        if let Some(ref v) = u.name {
            track.name = v.clone();
        }
        if let Some(v) = u.muted {
            track.muted = v;
        }
        if let Some(v) = u.locked {
            track.locked = v;
        }
        if let Some(v) = u.hidden {
            track.hidden = v;
        }
        if let Some(v) = u.is_main {
            track.is_main = v;
        }
        Ok(())
    }

    pub(super) fn apply_element_split_keep_left(
        &mut self,
        payload: &super::super::operations::ElementSplitKeepLeftPayload,
    ) -> crate::error::Result<()> {
        let element =
            Self::find_element_mut(&mut self.tracks, &payload.track_id, &payload.element_id)?;
        if let Some(new_dur) = payload.new_duration {
            element.duration = new_dur;
        } else {
            element.duration = payload.split_point - element.trim_start;
        }
        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_element_split_keep_right(
        &mut self,
        payload: &super::super::operations::ElementSplitKeepRightPayload,
    ) -> crate::error::Result<()> {
        let element =
            Self::find_element_mut(&mut self.tracks, &payload.track_id, &payload.element_id)?;
        element.start_time = payload.new_start_time;
        element.trim_start = payload.split_point;
        if let Some(new_dur) = payload.new_duration {
            element.duration = new_dur;
        }
        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_project_update(
        &mut self,
        payload: &super::super::operations::ProjectUpdatePayload,
    ) -> crate::error::Result<()> {
        if let Some(v) = payload.updates.fps {
            self.fps = v;
        }
        if let Some(ref r) = payload.updates.resolution {
            self.resolution = *r;
        }
        Ok(())
    }

    // ---- P2: apply methods ----

    pub(super) fn apply_element_add(
        &mut self,
        payload: &super::super::operations::ElementAddPayload,
        base_dir: Option<&std::path::Path>,
    ) -> crate::error::Result<()> {
        let mut element: Element = serde_json::from_value(payload.element.clone())
            .map_err(|e| crate::error::Error::Other(format!("Invalid element JSON: {}", e)))?;

        Self::resolve_element_paths(&mut element, base_dir);

        let track = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .ok_or_else(|| {
                crate::error::Error::Other(format!("Track not found: {}", payload.track_id))
            })?;

        if let Some(idx) = payload.index {
            let insert_at = idx.min(track.elements.len());
            track.elements.insert(insert_at, element);
        } else {
            track.elements.push(element);
        }

        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_element_remove(
        &mut self,
        payload: &super::super::operations::ElementRemovePayload,
    ) -> crate::error::Result<()> {
        let track = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .ok_or_else(|| {
                crate::error::Error::Other(format!("Track not found: {}", payload.track_id))
            })?;

        let len_before = track.elements.len();
        track.elements.retain(|e| e.id != payload.element_id);

        if track.elements.len() == len_before {
            return Err(crate::error::Error::Other(format!(
                "Element not found: {}",
                payload.element_id
            )));
        }

        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_element_move(
        &mut self,
        payload: &super::super::operations::ElementMovePayload,
    ) -> crate::error::Result<()> {
        let element = {
            let from_track = self
                .tracks
                .iter_mut()
                .find(|t| t.id == payload.from_track_id)
                .ok_or_else(|| {
                    crate::error::Error::Other(format!(
                        "Source track not found: {}",
                        payload.from_track_id
                    ))
                })?;

            let pos = from_track
                .elements
                .iter()
                .position(|e| e.id == payload.element_id)
                .ok_or_else(|| {
                    crate::error::Error::Other(format!("Element not found: {}", payload.element_id))
                })?;

            from_track.elements.remove(pos)
        };

        let to_track = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.to_track_id)
            .ok_or_else(|| {
                crate::error::Error::Other(format!(
                    "Target track not found: {}",
                    payload.to_track_id
                ))
            })?;

        to_track.elements.push(element);
        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_element_split_at(
        &mut self,
        payload: &super::super::operations::ElementSplitAtPayload,
        base_dir: Option<&std::path::Path>,
    ) -> crate::error::Result<()> {
        let element =
            Self::find_element_mut(&mut self.tracks, &payload.track_id, &payload.element_id)?;
        element.duration = payload.split_point - element.trim_start;

        let mut right_element: Element = serde_json::from_value(payload.right_element.clone())
            .map_err(|e| {
                crate::error::Error::Other(format!("Invalid right element JSON: {}", e))
            })?;
        Self::resolve_element_paths(&mut right_element, base_dir);

        let track = self
            .tracks
            .iter_mut()
            .find(|t| t.id == payload.track_id)
            .ok_or_else(|| {
                crate::error::Error::Other(format!("Track not found: {}", payload.track_id))
            })?;

        let insert_pos = track
            .elements
            .iter()
            .position(|e| e.id == payload.element_id)
            .map(|p| p + 1)
            .unwrap_or(track.elements.len());
        track.elements.insert(insert_pos, right_element);

        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_element_link_audio(
        &mut self,
        payload: &super::super::operations::ElementLinkAudioPayload,
        base_dir: Option<&std::path::Path>,
    ) -> crate::error::Result<()> {
        let mut audio_element: Element = serde_json::from_value(payload.audio_element.clone())
            .map_err(|e| {
                crate::error::Error::Other(format!("Invalid audio element JSON: {}", e))
            })?;
        Self::resolve_element_paths(&mut audio_element, base_dir);

        let audio_id = audio_element.id.clone();

        let video_el = Self::find_element_mut(
            &mut self.tracks,
            &payload.video_track_id,
            &payload.video_element_id,
        )?;
        if let ElementType::Media(ref mut m) = video_el.element_type {
            m.linked_audio_id = Some(audio_id);
        }

        if let Some(ref track_json) = payload.audio_track {
            let mut new_track: Track = serde_json::from_value(track_json.clone()).map_err(|e| {
                crate::error::Error::Other(format!("Invalid audio track JSON: {}", e))
            })?;
            new_track.elements.push(audio_element);
            self.tracks.push(new_track);
        } else {
            let audio_track = self
                .tracks
                .iter_mut()
                .find(|t| t.id == payload.audio_track_id)
                .ok_or_else(|| {
                    crate::error::Error::Other(format!(
                        "Audio track not found: {}",
                        payload.audio_track_id
                    ))
                })?;
            audio_track.elements.push(audio_element);
        }

        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_element_unlink_audio(
        &mut self,
        payload: &super::super::operations::ElementUnlinkAudioPayload,
    ) -> crate::error::Result<()> {
        let linked_audio_id = {
            let video_el = Self::find_element_mut(
                &mut self.tracks,
                &payload.video_track_id,
                &payload.video_element_id,
            )?;
            let audio_id = match &video_el.element_type {
                ElementType::Media(m) => m.linked_audio_id.clone(),
                _ => None,
            };
            if let ElementType::Media(ref mut m) = video_el.element_type {
                m.linked_audio_id = None;
            }
            audio_id
        };

        if let Some(audio_id) = linked_audio_id {
            for track in &mut self.tracks {
                track.elements.retain(|e| e.id != audio_id);
            }
        }

        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_track_add(
        &mut self,
        payload: &super::super::operations::TrackAddPayload,
        base_dir: Option<&std::path::Path>,
    ) -> crate::error::Result<()> {
        let mut track: Track = serde_json::from_value(payload.track.clone())
            .map_err(|e| crate::error::Error::Other(format!("Invalid track JSON: {}", e)))?;

        for element in &mut track.elements {
            Self::resolve_element_paths(element, base_dir);
        }

        if let Some(idx) = payload.index {
            let insert_at = idx.min(self.tracks.len());
            self.tracks.insert(insert_at, track);
        } else {
            self.tracks.push(track);
        }

        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_track_remove(
        &mut self,
        payload: &super::super::operations::TrackRemovePayload,
    ) -> crate::error::Result<()> {
        let len_before = self.tracks.len();
        self.tracks.retain(|t| t.id != payload.track_id);

        if self.tracks.len() == len_before {
            return Err(crate::error::Error::Other(format!(
                "Track not found: {}",
                payload.track_id
            )));
        }

        self.recalculate_duration();
        Ok(())
    }

    pub(super) fn apply_track_reorder(
        &mut self,
        payload: &super::super::operations::TrackReorderPayload,
    ) -> crate::error::Result<()> {
        if payload.from_index >= self.tracks.len() || payload.to_index >= self.tracks.len() {
            return Err(crate::error::Error::Other(format!(
                "Track reorder index out of bounds: from={}, to={}, len={}",
                payload.from_index,
                payload.to_index,
                self.tracks.len()
            )));
        }

        let track = self.tracks.remove(payload.from_index);
        if track.id != payload.track_id {
            let actual_track_id = track.id.clone();
            self.tracks.insert(payload.from_index, track);
            return Err(crate::error::Error::Other(format!(
                "Track reorder id mismatch: expected={}, actual={}",
                payload.track_id, actual_track_id
            )));
        }
        self.tracks.insert(payload.to_index, track);
        Ok(())
    }

    pub(super) fn apply_batch(
        &mut self,
        payload: &super::super::operations::BatchPayload,
        base_dir: Option<&std::path::Path>,
    ) -> crate::error::Result<()> {
        for sub_op in &payload.operations {
            let result = self.try_apply_operation_with_base_dir(sub_op, base_dir)?;
            if matches!(result, super::super::operations::ApplyResult::Unsupported) {
                return Err(crate::error::Error::Other(format!(
                    "Unsupported sub-operation in batch: {}",
                    sub_op.op_type
                )));
            }
        }
        Ok(())
    }

    fn find_element_mut<'a>(
        tracks: &'a mut [Track],
        track_id: &str,
        element_id: &str,
    ) -> crate::error::Result<&'a mut Element> {
        tracks
            .iter_mut()
            .find(|t| t.id == track_id)
            .and_then(|t| t.elements.iter_mut().find(|e| e.id == element_id))
            .ok_or_else(|| {
                crate::error::Error::Other(format!(
                    "Element not found: track={}, element={}",
                    track_id, element_id
                ))
            })
    }

    fn resolve_element_paths(element: &mut Element, base_dir: Option<&std::path::Path>) {
        let base = match base_dir {
            Some(d) => d,
            None => return,
        };

        match &mut element.element_type {
            ElementType::Media(ref mut m) => {
                Self::resolve_source_path(&mut m.src, base);
            }
            ElementType::Audio(ref mut a) => {
                Self::resolve_source_path(&mut a.src, base);
            }
            _ => {}
        }
    }

    fn resolve_source_path(src: &mut String, base: &std::path::Path) {
        if !std::path::Path::new(src.as_str()).is_absolute() {
            *src = base.join(src.as_str()).to_string_lossy().to_string();
        }
    }
}
