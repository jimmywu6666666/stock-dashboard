# DSA 东方财富资讯接入说明

本看板可以通过 `DSA_API_BASE_URL` 调用独立运行的 DSA 服务，并把本地抓取的东方财富个股资讯和公告作为 `custom_news_items` 传给 DSA，让这些资讯参与 AI 分析。

## 看板侧配置

启动本看板前设置 DSA 服务地址：

```bash
DSA_API_BASE_URL=http://127.0.0.1:8000 node --experimental-sqlite server/index.js
```

默认会要求 DSA 输出中文报告：

```bash
DSA_REPORT_LANGUAGE=zh
```

看板代理给 DSA 的请求形态如下：

```json
{
  "stock_code": "600519",
  "report_type": "detailed",
  "force_refresh": true,
  "async_mode": true,
  "stock_name": "贵州茅台",
  "original_query": "600519",
  "selection_source": "manual",
  "notify": false,
  "report_language": "zh",
  "custom_news_items": [
    {
      "title": "新闻或公告标题",
      "summary": "摘要或公告标题",
      "source": "东方财富资讯",
      "published_at": "2026-06-12T09:30:00+08:00",
      "url": "https://...",
      "type": "news"
    }
  ]
}
```

## DSA 侧改造状态

当前工作区的 `daily_stock_analysis/` 已经完成这条链路的改造：

- `api/v1/schemas/analysis.py` 已支持 `custom_news_items`。
- `api/v1/endpoints/analysis.py` 已把字段传给同步分析和异步任务队列。
- `src/services/task_queue.py` 已在任务中保存并透传自定义资讯。
- `src/services/analysis_service.py` 已把字段传给分析流水线。
- `src/core/pipeline.py` 会优先使用 `custom_news_items` 生成新闻上下文；未传入时保留 DSA 原搜索逻辑。

下面是改造要点，后续升级 DSA 时可以按这个清单核对。

## DSA 侧改造要点

在 DSA 的 `api/v1/schemas/analysis.py` 中扩展请求模型：

```python
class CustomNewsItem(BaseModel):
    title: str
    summary: str = ""
    source: str = ""
    published_at: str = ""
    url: str = ""
    type: str = "news"

class AnalyzeRequest(BaseModel):
    ...
    report_language: Optional[str] = "zh"
    custom_news_items: Optional[List[CustomNewsItem]] = None
```

然后把字段一路传进分析流水线：

- 在 `api/v1/endpoints/analysis.py` 里，把 `request.report_language` 和 `request.custom_news_items` 传给 `AnalysisService.analyze_stock(...)`。
- 在 `AnalysisService.analyze_stock(...)` 增加可选参数。
- 在 `StockAnalysisPipeline` 增加对应上下文字段。
- 在新闻/搜索阶段，优先使用 `custom_news_items` 作为新闻与公告上下文；如果没有传入，则保持 DSA 原来的搜索服务逻辑。
- 在报告语言处理上，优先使用请求里的 `report_language`；没有传入时再使用 DSA 原配置。

推荐给模型的上下文语义：

- 标记这些内容来自“东方财富个股资讯与公告”。
- 每条包含标题、来源、发布时间、类型和摘要。
- 公告比普通新闻可靠性更高，风险判断应优先参考公告。
- 输出语言固定为中文，除股票代码、专有名词和模型名外不要输出英文段落。

如果 DSA 没做这个改造，请求里的 `custom_news_items` 和 `report_language` 可能会被忽略；分析仍可能运行，但东方财富资讯不会真正影响 AI 报告，报告语言也会继续受 DSA 自身配置控制。
