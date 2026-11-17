/** Decode a Mapbox polyline6, rejecting invalid or excessively large routes. */
function decodeRoutePath(encoded) {
  const points = [];
  let cursor = 0;
  let latitude = 0;
  let longitude = 0;

  function nextDelta() {
    let value = 0;
    for (let shift = 0; shift <= 30 && cursor < encoded.length; shift += 5) {
      const char = encoded.charCodeAt(cursor++) - 63;
      if (char < 0 || char > 63) return null;
      value += (char & 31) * 2 ** shift;
      if (char < 32) return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
    }
    return null;
  }

  while (cursor < encoded.length) {
    if (points.length >= 32_768) return null;
    const latitudeDelta = nextDelta();
    const longitudeDelta = nextDelta();
    if (latitudeDelta === null || longitudeDelta === null) return null;
    latitude += latitudeDelta;
    longitude += longitudeDelta;
    if (Math.abs(latitude) > 90e6 || Math.abs(longitude) > 180e6) return null;
    points.push({ latitude: latitude / 1e6, longitude: longitude / 1e6 });
  }
  if (
    points.length < 2 ||
    points.every(
      (point) => point.latitude === points[0].latitude && point.longitude === points[0].longitude,
    )
  )
    return null;
  return points;
}

/** The simulation uses the full geometry. Limit points in the presentation payload. */
function displayRoute(points) {
  const maxPoints = 100;
  if (points.length <= maxPoints) return points;
  return Array.from(
    { length: maxPoints },
    (_, index) => points[Math.round((index * (points.length - 1)) / (maxPoints - 1))],
  );
}

module.exports = { decodeRoutePath, displayRoute };
