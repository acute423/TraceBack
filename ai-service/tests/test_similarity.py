import unittest

from similarity import normalized_cosine_similarity


class NormalizedCosineSimilarityTests(unittest.TestCase):
    def test_identical_vectors_map_to_one(self) -> None:
        self.assertAlmostEqual(normalized_cosine_similarity([1, 2], [1, 2]), 1.0)

    def test_orthogonal_vectors_map_to_one_half(self) -> None:
        self.assertAlmostEqual(normalized_cosine_similarity([1, 0], [0, 1]), 0.5)

    def test_opposite_vectors_map_to_zero(self) -> None:
        self.assertAlmostEqual(normalized_cosine_similarity([1, -2], [-1, 2]), 0.0)

    def test_rejects_mismatched_dimensions(self) -> None:
        with self.assertRaisesRegex(ValueError, "same number"):
            normalized_cosine_similarity([1], [1, 2])

    def test_rejects_zero_vectors(self) -> None:
        with self.assertRaisesRegex(ValueError, "Zero vectors"):
            normalized_cosine_similarity([0, 0], [1, 1])

    def test_rejects_non_finite_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "finite"):
            normalized_cosine_similarity([1, float("nan")], [1, 2])


if __name__ == "__main__":
    unittest.main()
