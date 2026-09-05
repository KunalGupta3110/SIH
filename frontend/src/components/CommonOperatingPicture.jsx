import MapPanel from "./MapPanel.jsx";
import EntitiesPanel from "./EntitiesPanel.jsx";
import EntityDetailPanel from "./EntityDetailPanel.jsx";
import EventSeriesStrip from "./EventSeriesStrip.jsx";

// The default screen of the console: a full-bleed map with floating glass
// panels laid over it (entities list, the selected track/sensor detail,
// the event-series strip) instead of a sidebar of tabs. This is the "COP"
// (Common Operating Picture) mode — everything else in App.jsx is a
// dedicated full-page view for when an operator wants the whole list
// rather than one selected thing on the map.
export default function CommonOperatingPicture({
  cameraHealth,
  incidents,
  selectedId,
  onSelect,
  selectedCamera,
  selectedTrack,
  onCloseDetail,
  onAcknowledged,
}) {
  return (
    <>
      <MapPanel
        cameraHealth={cameraHealth}
        incidents={incidents}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <EntitiesPanel
        cameraHealth={cameraHealth}
        incidents={incidents}
        selectedId={selectedId}
        onSelect={onSelect}
        variant="floating"
      />
      {selectedCamera && (
        <EntityDetailPanel kind="SENSOR" entity={selectedCamera} onClose={onCloseDetail} />
      )}
      {selectedTrack && (
        <EntityDetailPanel
          kind="TRACK"
          entity={selectedTrack}
          onClose={onCloseDetail}
          onAcknowledged={onAcknowledged}
        />
      )}
      <EventSeriesStrip incidents={incidents} />
    </>
  );
}
