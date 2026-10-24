#!/usr/bin/env python3
"""Read-only Iloilo spatial export and independent on-disk validation.

No source repair, point generation, simplification, database writes, or roads.
Run with --validate-only to validate existing outputs without writing them.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from numbers import Integral
from pathlib import Path
import platform
import sys
import tempfile

import geopandas as gpd
import pandas as pd
import pyogrio
import pyproj
import shapely
from shapely.geometry import mapping, shape


LAYERS = ("barangay", "barangay_nodes", "city_boundary")
FILES = {
    "barangay": "barangays.geojson",
    "barangay_nodes": "barangay_nodes.geojson",
    "city_boundary": "city_boundary.geojson",
}
PROPERTIES = {
    "barangay": ["adm4_psgc", "adm4_en"],
    "barangay_nodes": ["adm4_psgc", "adm4_en"],
    # The dissolved source inherited one barangay's name/ID. They do not name
    # the city and must not be published as city identity.
    "city_boundary": ["adm3_psgc"],
}
COUNTS = {"barangay": 180, "barangay_nodes": 180, "city_boundary": 1}
OUTPUT_CRS = "EPSG:4326"
METRIC_CRS = "EPSG:32651"
BOUNDARY_TOLERANCE_METRES = 0.001
# Broad validation envelope, NOT display coordinates or an administrative boundary.
# Actual bounds and all display positions are derived from source geometry.
SANITY_ENVELOPE = (122.3, 10.5, 122.8, 11.0)
DISCLAIMER = (
    "Incident locations are represented at barangay level using an established "
    "representative point for each polygon. Points, markers, and intensity "
    "visualizations do not show exact incident locations."
)
POINT_METHOD = (
    "Existing QGIS Point-on-Surface representative points from barangay_nodes, "
    "reprojected without regenerating or moving points. They are not incident "
    "sites, GPS observations, household addresses, barangay halls, or population centers."
)


class ValidationError(ValueError):
    """Invalid spatial source or generated output; never silently compensated."""


def require(condition, message):
    if not condition:
        raise ValidationError(message)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def identifier(value):
    """Preserve text verbatim (including zeroes); never pad or coerce floats."""
    require(not pd.isna(value), "Null PSGC identifier")
    if isinstance(value, str):
        require(value != "" and value == value.strip() and value.isascii()
                and value.isdigit(), f"Invalid text PSGC: {value!r}")
        return value
    if isinstance(value, Integral) and not isinstance(value, bool):
        require(value >= 0, f"Negative PSGC: {value!r}")
        return str(value)
    raise ValidationError(f"PSGC must be text or an integer, not {value!r}")


def geometry_stats(frame):
    return {
        "null": int(frame.geometry.isna().sum()),
        "empty": int(frame.geometry.is_empty.sum()),
        "invalid": int((~frame.geometry.is_valid & frame.geometry.notna()).sum()),
    }


def validate_frame(frame, layer):
    require(isinstance(frame, gpd.GeoDataFrame) and "geometry" in frame.columns,
            f"{layer}: missing geometry column")
    require(frame.crs is not None, f"{layer}: missing CRS")
    require(len(frame) == COUNTS[layer],
            f"{layer}: expected {COUNTS[layer]} features, found {len(frame)}")
    missing = sorted(set(PROPERTIES[layer]) - set(frame.columns))
    require(not missing, f"{layer}: missing required fields {missing}")
    stats = geometry_stats(frame)
    require(not any(stats.values()), f"{layer}: geometry problems {stats}; no repair attempted")
    allowed = {"Point"} if layer == "barangay_nodes" else {"Polygon", "MultiPolygon"}
    unexpected = sorted(set(frame.geom_type) - allowed)
    require(not unexpected, f"{layer}: unexpected geometry types {unexpected}")
    require(not any(geom.has_z for geom in frame.geometry), f"{layer}: unexpected 3D geometry")
    if layer != "city_boundary":
        ids = frame["adm4_psgc"]
        require(all(isinstance(v, str) and identifier(v) == v for v in ids),
                f"{layer}: identifiers must be strings")
        duplicates = ids[ids.duplicated(keep=False)].tolist()
        require(not duplicates, f"{layer}: duplicate identifiers {duplicates}")
        names = frame["adm4_en"]
        require(all(isinstance(v, str) and bool(v.strip()) for v in names),
                f"{layer}: missing/blank barangay names")
    else:
        require(all(identifier(v) == v for v in frame["adm3_psgc"]),
                "city_boundary: city identifiers must be strings")
    return stats


def validate_sanity(frame, layer):
    require(frame.crs.to_epsg() == 4326, f"{layer}: output CRS must be EPSG:4326")
    west, south, east, north = (float(v) for v in frame.total_bounds)
    require(-180 <= west <= east <= 180 and -90 <= south <= north <= 90,
            f"{layer}: invalid longitude/latitude bounds")
    a, b, c, d = SANITY_ENVELOPE
    require(a <= west <= east <= c and b <= south <= north <= d,
            f"{layer}: bounds outside broad Iloilo sanity envelope: {[west, south, east, north]}")


def validate_relationships(frames):
    polygons = frames["barangay"].set_index("adm4_psgc")
    nodes = frames["barangay_nodes"].to_crs(polygons.crs).set_index("adm4_psgc")
    polygon_ids, node_ids = set(polygons.index), set(nodes.index)
    require(polygon_ids == node_ids,
            f"ID mismatch: missing nodes={sorted(polygon_ids - node_ids)}, "
            f"extra nodes={sorted(node_ids - polygon_ids)}")
    disagreements = [
        {"adm4_psgc": i, "polygon_name": polygons.loc[i, "adm4_en"],
         "point_name": nodes.loc[i, "adm4_en"]}
        for i in sorted(polygon_ids)
        if polygons.loc[i, "adm4_en"] != nodes.loc[i, "adm4_en"]
    ]
    require(not disagreements, f"Name discrepancies: {disagreements}")
    failed = [
        {"adm4_psgc": i, "adm4_en": polygons.loc[i, "adm4_en"]}
        for i in sorted(polygon_ids)
        if not polygons.loc[i, "geometry"].covers(nodes.loc[i, "geometry"])
    ]
    require(not failed, f"Points not covered by matching polygon: {failed}")
    city = frames["city_boundary"].to_crs(METRIC_CRS).geometry.union_all()
    collection = frames["barangay"].to_crs(METRIC_CRS).geometry.union_all()
    strict = bool(city.covers(collection))
    outside_area = float(collection.difference(city).area)
    # A millimetre allows only numerical reprojection/overlay noise, not gaps.
    covered = bool(city.buffer(BOUNDARY_TOLERANCE_METRES).covers(collection))
    require(covered, f"City boundary does not cover barangays: outside area={outside_area} m²")
    return {
        "matching_ids": len(polygon_ids),
        "name_discrepancies": disagreements,
        "point_polygon_failures": failed,
        "points_covered": len(polygon_ids),
        "city_boundary": {
            "strictly_covers": strict,
            "covers_with_tolerance": covered,
            "outside_area_m2": outside_area,
            "tolerance_metres": BOUNDARY_TOLERANCE_METRES,
            "tolerance_reason": "Only floating-point reprojection/overlay noise; no geometry modification.",
        },
    }


def read_source(source):
    """Pyogrio read calls open datasets for reading, never writing."""
    available = sorted(str(row[0]) for row in pyogrio.list_layers(source))
    missing = sorted(set(LAYERS) - set(available))
    require(not missing, f"Missing required layers: {missing}; available={available}")
    frames, inspection = {}, {}
    for layer in LAYERS:
        frame = gpd.read_file(source, layer=layer, engine="pyogrio")
        require(isinstance(frame, gpd.GeoDataFrame) and "geometry" in frame.columns,
                f"{layer}: missing geometry column")
        info = pyogrio.read_info(source, layer=layer)
        inspection[layer] = {
            "crs": frame.crs.to_string() if frame.crs else None,
            "feature_count": len(frame),
            "geometry_types": sorted(set(frame.geom_type)),
            "columns": [str(info["fid_column"]), str(info["geometry_name"])]
                       + [str(v) for v in info["fields"]],
            "geometry_counts": geometry_stats(frame),
            "repaired_geometry_count": 0,
        }
        missing_fields = sorted(set(PROPERTIES[layer]) - set(frame.columns))
        require(not missing_fields, f"{layer}: missing required fields {missing_fields}")
        frame = frame[PROPERTIES[layer] + ["geometry"]].copy()
        key = "adm3_psgc" if layer == "city_boundary" else "adm4_psgc"
        frame[key] = frame[key].map(identifier)
        frame = frame.sort_values(key, kind="stable").reset_index(drop=True)
        validate_frame(frame, layer)
        frames[layer] = frame
    source_relationships = validate_relationships(frames)
    return frames, available, inspection, source_relationships


def collection(frame, layer):
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {p: row[p] for p in PROPERTIES[layer]},
             "geometry": mapping(row.geometry)}
            for _, row in frame.iterrows()
        ],
    }


def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                       allow_nan=False) + "\n").encode("utf-8")


def file_details(frame, layer, data):
    return {
        "source_layer": layer,
        "feature_count": len(frame),
        "geometry_types": sorted(set(frame.geom_type)),
        "bbox": [float(v) for v in frame.total_bounds],
        "retained_properties": PROPERTIES[layer],
        "geometry_counts": geometry_stats(frame),
        "repaired_geometry_count": 0,
        "size_bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def strict_json(data):
    def reject_constant(value):
        raise ValidationError(f"Nonfinite JSON number: {value}")
    return json.loads(data, parse_constant=reject_constant)


def validate_outputs(output, expected=None, expected_source_hash=None):
    """Read actual files afresh; check structure, attributes, geometry, metadata."""
    output = Path(output)
    frames, details = {}, {}
    for layer, filename in FILES.items():
        path = output / filename
        require(path.is_file(), f"Missing output: {filename}")
        data = path.read_bytes()
        document = strict_json(data)
        require(document.get("type") == "FeatureCollection", f"{filename}: not a FeatureCollection")
        require("crs" not in document, f"{filename}: RFC 7946 must not declare a legacy CRS")
        features = document.get("features")
        require(isinstance(features, list) and len(features) == COUNTS[layer],
                f"{filename}: wrong feature count")
        for feature in features:
            require(feature.get("type") == "Feature" and feature.get("geometry") is not None,
                    f"{filename}: missing feature/geometry")
            require(isinstance(feature.get("properties"), dict)
                    and set(feature["properties"]) == set(PROPERTIES[layer]),
                    f"{filename}: unexpected or missing properties")
            # Parse separately to catch malformed/nonfinite or unsupported geometry.
            require(not shape(feature["geometry"]).is_empty, f"{filename}: empty geometry")
        frame = gpd.GeoDataFrame.from_features(features, crs=OUTPUT_CRS)
        validate_frame(frame, layer)
        validate_sanity(frame, layer)
        if expected is not None:
            require(document == strict_json(encode(collection(expected[layer], layer))),
                    f"{filename}: differs from source-derived export")
        frames[layer] = frame
        details[filename] = file_details(frame, layer, data)
    relationships = validate_relationships(frames)
    metadata_path = output / "spatial_metadata.json"
    require(metadata_path.is_file(), "Missing spatial_metadata.json")
    metadata = strict_json(metadata_path.read_bytes())
    require(metadata["output_crs"] == OUTPUT_CRS, "Metadata CRS mismatch")
    require(metadata["files"] == details, "Metadata file details mismatch")
    require(metadata["validation"]["output"] == relationships, "Metadata validation mismatch")
    require(metadata["validation"]["result"] == "passed", "Metadata does not report passed")
    require(metadata["repaired_geometry_count"] == 0 and metadata["simplification"]["applied"] is False,
            "Metadata reports unexpected repair/simplification")
    require(metadata["application_disclaimer"] == DISCLAIMER, "Missing location disclaimer")
    require(metadata["representative_point_method"] == POINT_METHOD, "Point method mismatch")
    timestamp(metadata["generated_at_utc"])
    require(Path(metadata["source_filename"]).name == metadata["source_filename"],
            "Public metadata must not expose an absolute source path")
    if expected_source_hash is not None:
        require(metadata["source_sha256"] == expected_source_hash, "Metadata source hash mismatch")
    return details, relationships


def timestamp(value=None):
    if value is None:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(parsed.tzinfo is not None, "Generation timestamp requires a timezone")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_write(path, data):
    require(not path.is_symlink(), f"Refusing to replace symlink: {path.name}")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".spatial-", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(data)
        temporary.replace(path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def run(source, output, validate_only=False, generated_at=None):
    source = Path(source).expanduser().resolve(strict=True)
    require(source.is_file(), "Source must be a GeoPackage file")
    output = Path(output).expanduser().resolve()
    before = sha256(source)
    print(f"Source: {source}\nSHA-256 before: {before}")
    try:
        frames, available, inspection, source_relationships = read_source(source)
        projected = {layer: frame.to_crs(OUTPUT_CRS) for layer, frame in frames.items()}
        for layer, frame in projected.items():
            validate_frame(frame, layer)
            validate_sanity(frame, layer)
        output_relationships = validate_relationships(projected)
        if not validate_only:
            blobs = {FILES[layer]: encode(collection(frame, layer)) for layer, frame in projected.items()}
            metadata = {
                "dataset_title": "Iloilo City barangay display geography",
                "source_filename": source.name,
                "source_sha256": before,
                "generated_at_utc": timestamp(generated_at),
                "source_layer_names": available,
                "exported_source_layers": list(LAYERS),
                "source_inspection": inspection,
                "output_crs": OUTPUT_CRS,
                "files": {FILES[layer]: file_details(frame, layer, blobs[FILES[layer]])
                          for layer, frame in projected.items()},
                "repaired_geometry_count": 0,
                "simplification": {"applied": False, "tolerance_metres": None},
                "representative_point_method": POINT_METHOD,
                "validation": {"result": "passed", "source": source_relationships,
                               "output": output_relationships},
                "application_disclaimer": DISCLAIMER,
                "software": {"python": platform.python_version(), "geopandas": gpd.__version__,
                             "pyogrio": pyogrio.__version__, "shapely": shapely.__version__,
                             "pyproj": pyproj.__version__, "gdal": pyogrio.__gdal_version_string__},
                "notes": [
                    "Source integer PSGCs converted to text without guessing leading zeroes.",
                    "City boundary inherited a barangay name/ID; only existing adm3_psgc retained.",
                    "Roads, adjacency, population and incident data are not exported.",
                    "RFC 7946 GeoJSON uses longitude, latitude order without a legacy crs member.",
                ],
            }
            # Validate a complete staged set before replacing any generated file.
            output.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=".spatial-validate-", dir=output) as temporary:
                stage = Path(temporary)
                for filename, data in blobs.items():
                    (stage / filename).write_bytes(data)
                (stage / "spatial_metadata.json").write_bytes(encode(metadata))
                validate_outputs(stage, projected, before)
                for filename in [*blobs, "spatial_metadata.json"]:
                    require(not (output / filename).is_symlink(), f"Output symlink: {filename}")
                for filename in [*blobs, "spatial_metadata.json"]:
                    atomic_write(output / filename, (stage / filename).read_bytes())
        details, relationships = validate_outputs(output, projected, before)
        saved_metadata = strict_json((output / "spatial_metadata.json").read_bytes())
        require(saved_metadata["source_inspection"] == inspection,
                "Metadata source inspection mismatch")
        require(saved_metadata["source_layer_names"] == available
                and saved_metadata["exported_source_layers"] == list(LAYERS),
                "Metadata source layers mismatch")
        require(saved_metadata["validation"]["source"] == source_relationships,
                "Metadata source validation mismatch")
        print(json.dumps({"files": details, "relationships": relationships}, indent=2))
        print("PASS: source-derived exports and on-disk validation")
        return details
    finally:
        after = sha256(source)
        print(f"SHA-256 after:  {after}")
        require(before == after, "SOURCE HASH CHANGED: stop and investigate")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/data"))
    parser.add_argument("--validate-only", action="store_true", help="Read/validate existing outputs; write nothing")
    parser.add_argument("--generated-at", help="Optional timezone-aware ISO timestamp for byte-reproducible metadata")
    args = parser.parse_args()
    try:
        run(args.source, args.output, args.validate_only, args.generated_at)
    except (ValidationError, OSError, ValueError, KeyError, TypeError) as error:
        print(f"Spatial validation/export failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
