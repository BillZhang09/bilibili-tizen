# HDR10 与 Dolby Atmos 适配验证

## 当前结论

2026-11-02 在 S85F（Tizen 9.0、Chromium 120）完成首轮真实片源实验。HDR10 和 Atmos 均未通过播放验收。用户观察到间歇黑屏、音画停住，连屏幕计时器也会停住。根因尚未定位。

按实施计划的停止条件，暂停产品入口与默认启用。当前分支 `codex/feature-hdr10-dolby-atmos` 从画质选择提交 `e4427630d45dacc93b3c92a251920c0c100bee7e` 创建，`app/` 保持该基线。不能把下述能力检测、媒体时间推进或测试包装记为功能落地。

## 已确认的产品选择

- HDR10 接入现有播放中画质菜单，并在设置页提供对应档位。首次使用保留现有默认值。
- 设备与片源支持时，允许在原画质上限下选择 HDR10。成功后再同步提高上限并记住偏好；失败时保留原设置。后续视频缺少 HDR10 时回退 SDR，保留偏好。
- Atmos 独立于画质，默认优先可用音轨。设置页提供开关，播放面板显示实际音轨状态。
- 验收使用电视扬声器及电视内已登录的大会员账号，不包含 eARC 透传或空间渲染验收。
- 复用 Shaka 4.12.5／MSE，不引入原生代理，不更换播放器。

## 真机证据

| 检查 | 结果与边界 |
| --- | --- |
| 设备能力 | `isHdrTvSupport()`、Main10、E-AC-3 和 AAC 的 MSE 类型检测均返回支持。不能据此确认实际输出。 |
| 用户片源 | `BV1sK4y1Z7KG` P2，CID 330295149。提供 QN 125、3840×1920、`hev1.2.4.H150.90`，该 P 没有杜比音轨。 |
| HDR 媒体信息 | 文件头经 ffprobe 检查为 HEVC Main10、10 bit、BT.2020、SMPTE ST 2084（PQ）。 |
| HDR 首轮 | 网页流先后出现 403、Shaka 3016 解复用错误。不能将两种错误合并归因。 |
| HDR 强令牌对照 | 同一 P2 的 SDR／AAC 与 HDR／AAC 媒体时间均推进。实际 Player 路径的 HDR 45 秒观察中，媒体时间从 0 推进到约 44.98 秒。 |
| HDR 帧观测 | 上述实际 Player 轮次的 `requestVideoFrameCallback` 仅回调一次，`mediaTime=0`；早期 `totalVideoFrames` 为 0。这些计数尚未用相同 SDR 路径校准，不能单独证明冻结或正常。 |
| 人工观察 | 用户先报告画面和声音卡住，随后明确报告测试中间歇黑屏，音画和计时器一起停住。没有获得 HDR 输出正常的确认。 |
| Atmos 首个样本 | `BV12Yf5BAEyb` 网页接口返回 `ec-3`／30250，但读取两个音轨地址均为 403，播放报 Shaka 1001。该结果只适用于本轮样本和地址。 |
| Atmos 可读样本 | `BV1eV411W7tt` 返回类型 2 的杜比音轨，文件头读取为 206。ffprobe 确认为 Dolby Digital Plus＋Dolby Atmos、48 kHz、5.1 声道。 |
| 强令牌接口 | 对上述可读 Atmos 样本，app 端点的 `dash` 只有普通视频和音频；普通音频为 30280／30232／30216，没有杜比音轨。因此本轮使用网页端杜比音轨配合同片源的强令牌 SDR 视频。 |
| Atmos 持续播放 | 实际 Player 路径约 64.721 秒后停止推进。日志先出现音轨请求 Shaka 1002 超时，随后记录“卡死无进展，重载阶梯用尽”。这不证明 E-AC-3 解码器本身不支持。 |

三项额外候选中，`BV1vC4y1p7CY` 和 `BV1Me411L7N5` 本轮没有返回杜比音轨。不能按视频标题判断实际提供的格式。

## 实验与恢复

实验仅在临时打包副本中修改请求位、按对应轨道补齐强令牌元数据，并生成单一格式清单。实际 Player 轮次使用仓库的播放代码，HUD、帧回调观测和临时能力上限由测试脚本注入。没有保存新的画质或音轨偏好。

测试包装未包含自动 AAC 回退，格式组合、画质菜单、设置开关和跨视频行为也未实现。不能用这些包装验收最终产品的恢复能力。参考项目使用原生播放加本地代理，其结果不能替代本项目的 MSE 结果：[PiliPlus-Tizen](https://github.com/jackie099/PiliPlus-Tizen)。

已再次覆盖安装并启动预先核验的正常恢复包，回执 `ok=true`、`launched=true`。沿用现有 Public 证书，没有卸载、清除账号或改应用 ID。正常包保留字幕、画质和自动连播功能，`SELFTEST=false`，SHA-256：

```text
500ac5fe26f5ba2651eabdd875833902df11400e1d79d41cca2372735dd6b703
```

原始材料位于本机私有目录 `/private/tmp/bilibili-hdr-atmos-20261102/`，包括探针源码、媒体头、日志和安装回执。完整请求日志可能包含流签名，不应公开。脱敏结果及实验包索引另存于忽略目录 `dist/hdr-atmos-spike/`；其中的实验包会自动播放，只用于复验，不能代替正常安装包。

当前画质基线的完整 `tools/check.sh` 通过，其中播放控制为 27/27。该结果仅证明基线回归通过，不包含 HDR10／Atmos 验收。其他任务的未跟踪文档保持原样。

## 继续实施的条件

1. 在同一实际 Player 路径做 SDR／HDR 对照，区分网络等待、主线程停顿和解码输出冻结。校准帧回调和独立心跳，不能只检查 `currentTime`。
2. 对可读 Atmos 样本核查停在约 64.721 秒前后的分段请求与超时，确认 AAC 回退能保留视频、位置及最新暂停意图。不能把 206 文件头当成长播成功。
3. 获得持续音画及电视侧 HDR 状态的真实证据后，再接入产品菜单、设置、双端归一化和格式分别回退，并补全原计划中的离线、浏览器及真机验证。

能力 API 的适用范围见[三星 AVInfo 文档](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avinfo-api.html)。Shaka 的 Dolby 声明与配置见[Dolby 接入说明](https://professionalsupport.dolby.com/s/article/Dolby-Audio-and-Dolby-Vision-in-Shaka-Player)。两份文档均不保证本机实际播放成功。
