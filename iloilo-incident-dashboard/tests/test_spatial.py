"""Spatial tests use the real outputs; negative cases mutate temporary copies only."""

import copy
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import geopandas as gpd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import export_spatial as spatial  # noqa: E402


class SpatialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = ROOT / "public/data"
        cls.source = Path(os.environ.get("SPATIAL_SOURCE", ROOT.parent / "data/iloilo_resilience.gpkg"))

    def test_all_output_files_and_metadata(self):
        details, relationships = spatial.validate_outputs(self.output)
        self.assertEqual(len(details), 3)
        self.assertEqual(relationships["matching_ids"], 180)
        self.assertEqual(relationships["points_covered"], 180)
        self.assertEqual(relationships["point_polygon_failures"], [])
        self.assertTrue(relationships["city_boundary"]["covers_with_tolerance"])

    def test_properties_counts_ids_and_crs(self):
        frames = {}
        for layer, filename in spatial.FILES.items():
            document = json.loads((self.output / filename).read_text())
            self.assertEqual(document["type"], "FeatureCollection")
            self.assertNotIn("crs", document)
            self.assertEqual(len(document["features"]), spatial.COUNTS[layer])
            frame = gpd.read_file(self.output / filename, engine="pyogrio")
            self.assertEqual(frame.crs.to_epsg(), 4326)
            spatial.validate_frame(frame, layer)
            spatial.validate_sanity(frame, layer)
            frames[layer] = frame
        self.assertEqual(set(frames["barangay"].adm4_psgc), set(frames["barangay_nodes"].adm4_psgc))
        spatial.validate_relationships(frames)

    def test_identifier_strings_preserve_leading_zeroes(self):
        self.assertEqual(spatial.identifier("0631000001"), "0631000001")
        self.assertEqual(spatial.identifier(631000001), "631000001")
        for value in [None, "", " 631000001", 631000001.0, True, "NaN"]:
            with self.subTest(value=value), self.assertRaises(spatial.ValidationError):
                spatial.identifier(value)

    def test_missing_output_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(spatial.ValidationError, "Missing output"):
                spatial.validate_outputs(temporary)

    def mutate_output(self, filename, mutate):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for file in [*spatial.FILES.values(), "spatial_metadata.json"]:
                (directory / file).write_bytes((self.output / file).read_bytes())
            path = directory / filename
            value = json.loads(path.read_text())
            mutate(value)
            path.write_text(json.dumps(value))
            with self.assertRaises((spatial.ValidationError, ValueError)):
                spatial.validate_outputs(directory)

    def test_duplicate_id_rejected(self):
        def mutate(value):
            value["features"][1]["properties"]["adm4_psgc"] = value["features"][0]["properties"]["adm4_psgc"]
        self.mutate_output("barangay_nodes.geojson", mutate)

    def test_swapped_coordinates_rejected(self):
        def mutate(value):
            feature = value["features"][0]
            feature["geometry"]["coordinates"].reverse()
        self.mutate_output("barangay_nodes.geojson", mutate)

    def test_wrong_count_rejected(self):
        self.mutate_output("barangays.geojson", lambda value: value["features"].pop())

    def test_metadata_tampering_rejected(self):
        def mutate(value):
            value["files"]["barangays.geojson"]["feature_count"] = 179
        self.mutate_output("spatial_metadata.json", mutate)

    def test_name_mismatch_rejected(self):
        def mutate(value):
            value["features"][0]["properties"]["adm4_en"] = "Mismatched test name"
        self.mutate_output("barangay_nodes.geojson", mutate)

    def test_mismatched_id_sets_rejected(self):
        def mutate(value):
            value["features"][0]["properties"]["adm4_psgc"] = "000000000"
        self.mutate_output("barangay_nodes.geojson", mutate)

    def test_point_outside_matching_polygon_rejected(self):
        polygons = gpd.read_file(self.output / "barangays.geojson", engine="pyogrio")
        nodes = gpd.read_file(self.output / "barangay_nodes.geojson", engine="pyogrio")
        city = gpd.read_file(self.output / "city_boundary.geojson", engine="pyogrio")
        moved = nodes.copy()
        moved.loc[0, "geometry"] = Point(122.31, 10.51)
        with self.assertRaisesRegex(spatial.ValidationError, "Points not covered"):
            spatial.validate_relationships({"barangay": polygons, "barangay_nodes": moved, "city_boundary": city})

    def test_missing_field_crs_null_and_invalid_geometries_rejected(self):
        from shapely.geometry import Polygon
        frame = gpd.read_file(self.output / "barangays.geojson", engine="pyogrio")
        variants = [frame.drop(columns="adm4_en"), frame.drop(columns="geometry"),
                    frame.set_crs(None, allow_override=True)]
        missing_geometry = frame.copy()
        missing_geometry.loc[0, "geometry"] = None
        variants.append(missing_geometry)
        invalid = frame.copy()
        invalid.loc[0, "geometry"] = Polygon([(0, 0), (1, 1), (1, 0), (0, 1), (0, 0)])
        variants.append(invalid)
        for variant in variants:
            with self.assertRaises(spatial.ValidationError):
                spatial.validate_frame(variant, "barangay")

    def test_city_that_does_not_cover_barangays_rejected(self):
        frames = {layer: gpd.read_file(self.output / filename, engine="pyogrio")
                  for layer, filename in spatial.FILES.items()}
        frames["city_boundary"] = frames["city_boundary"].to_crs(spatial.METRIC_CRS)
        frames["city_boundary"].geometry = frames["city_boundary"].geometry.buffer(-100)
        with self.assertRaisesRegex(spatial.ValidationError, "City boundary does not cover"):
            spatial.validate_relationships(frames)

    def test_geojson_encoding_is_deterministic(self):
        document = json.loads((self.output / "barangay_nodes.geojson").read_text())
        self.assertEqual(spatial.encode(document), spatial.encode(copy.deepcopy(document)))

    def test_source_hash_and_read_only_validation(self):
        before = spatial.sha256(self.source)
        outputs_before = {p.name: spatial.sha256(p) for p in self.output.iterdir() if p.is_file()}
        with redirect_stdout(io.StringIO()):
            spatial.run(self.source, self.output, validate_only=True)
        self.assertEqual(spatial.sha256(self.source), before)
        self.assertEqual(outputs_before,
                         {p.name: spatial.sha256(p) for p in self.output.iterdir() if p.is_file()})

    def test_export_rerun_is_reproducible_and_preserves_unrelated_files(self):
        before = spatial.sha256(self.source)
        with tempfile.TemporaryDirectory() as temporary, redirect_stdout(io.StringIO()):
            output = Path(temporary) / "new-output"
            spatial.run(self.source, output, generated_at="2026-10-24T00:00:00Z")
            (output / "unrelated.txt").write_text("Do not replace")
            hashes = {p.name: spatial.sha256(p) for p in output.iterdir() if p.is_file()}
            spatial.run(self.source, output, generated_at="2026-10-24T00:00:00Z")
            self.assertEqual(hashes, {p.name: spatial.sha256(p) for p in output.iterdir() if p.is_file()})
        self.assertEqual(spatial.sha256(self.source), before)

    def test_missing_source_layer_rejected(self):
        with patch.object(spatial.pyogrio, "list_layers", return_value=[("barangay", "MultiPolygon")]):
            with self.assertRaisesRegex(spatial.ValidationError, "Missing required layers"):
                spatial.read_source(self.source)

    def test_boundary_point_is_permitted(self):
        frames = {layer: gpd.read_file(self.output / filename, engine="pyogrio")
                  for layer, filename in spatial.FILES.items()}
        polygon = frames["barangay"].iloc[0]
        geometry = polygon.geometry
        part = geometry.geoms[0] if geometry.geom_type == "MultiPolygon" else geometry
        index = frames["barangay_nodes"].index[
            frames["barangay_nodes"].adm4_psgc == polygon.adm4_psgc][0]
        frames["barangay_nodes"].loc[index, "geometry"] = Point(part.exterior.coords[0])
        result = spatial.validate_relationships(frames)
        self.assertEqual(result["points_covered"], 180)


if __name__ == "__main__":
    unittest.main()
