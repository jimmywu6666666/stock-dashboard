import unittest

try:
    from src.core.pipeline import StockAnalysisPipeline
except ModuleNotFoundError as exc:
    StockAnalysisPipeline = None
    IMPORT_ERROR = exc
else:
    IMPORT_ERROR = None


@unittest.skipIf(StockAnalysisPipeline is None, f"pipeline dependencies unavailable: {IMPORT_ERROR}")
class CustomNewsContextTestCase(unittest.TestCase):
    def test_custom_news_context_is_normalized_and_rendered_in_chinese(self):
        pipeline = object.__new__(StockAnalysisPipeline)

        items = pipeline._normalize_custom_news_items([
            {
                "title": "永鼎股份发布公告",
                "summary": "公司披露经营情况。",
                "source": "东方财富公告",
                "published_at": "2026-06-12T09:30:00+08:00",
                "url": "https://example.com/notice",
                "type": "announcement",
            },
            {"summary": "缺少标题会被跳过"},
        ])

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["type"], "announcement")

        context = pipeline._format_custom_news_context(items, "永鼎股份")

        self.assertIn("调用方提供的东方财富资讯与公告", context)
        self.assertIn("[公告] 永鼎股份发布公告", context)
        self.assertIn("公告类信息可靠性高于普通新闻", context)
        self.assertIn("公司披露经营情况", context)


if __name__ == "__main__":
    unittest.main()
