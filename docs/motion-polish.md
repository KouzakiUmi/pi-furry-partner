# 全动态动作打磨与验收

更新：2026-10-24。当前任务是插件全动态线路；角色印象 PV、四面图及 legacy 的旧资源不在本轮修改范围。


## 当前进度快照（后文为按轮次保留的历史）

- 已发布／本机安装基线：main v2.5.1-preview.1（19片），Legacy legacy-v2.4.2；本轮源码候选2.5.1-preview.2尚未重新归档、安装或发布。
- 用户已分别通过探头、晃脑袋、抖耳v2及开心小弹v5，均按精确批准输出接入Pi/DSH，当前28片；实际集成与stage验证以本轮报告为准。不能以旧包冒充28片版本。
- 八项辅助动作中，wave/nod/peek/stretch/head-shake/ear-flick/bounce已获批准并接入；仅剩nuzzle。抖耳v1否决保留，v2已通过；辅助新候选先审原生紫底表演源，获源批准后再alpha及最终透明门，不以相近情绪片回退冒充。
- 随机待机为已通过的idle/idle-center/idle-right，在完整循环边界轮换。已通过动作与已接受的细小局限冻结，不因为继续扩充重开。

## 基线和本轮顺序

- 正式基线为 main / v2.5.0；legacy / v2.4.1 保留原资源。正式标签和公开附件不覆盖。
- 用户要求「丝滑、不像慢动作、有动感」，以有情绪、有支撑的整体表演为目标。先区分时钟/加载停顿与源动画表演，再改对应部分。
- 首批以 think、joy 验证方法。保留旧片与失败候选，先完成内部两路复核及原速旧新对照，再交用户评审；通过后扩大动作批次。试片不自动安装或替换正式资源。
- 用户已说明 H3 额度充足，应节省反复推理的 LLM 额度。明显错误尽早退回，整段重生；同类错误连续两次出现时改变参照或制作方法，不无限微调同一提示词。

## 表演与时间

- 动作改变要有利落起势、可读重音、短而有思想的停顿、带重量的回归。正常速度的小动作不应被拉长占满一整圈。
- 视线、头颈、胸肩、肘腕和爪的支撑属于同一个意图。附属的帽耳、围巾、下摆随主动作产生适量滞后，不独立匀速摆动，也不逐肢体排队演示。
- 待机和休息允许克制，不能把所有状态都改成大幅弹跳。不同情绪要有不同节拍。
- H3 保留完整原生前向时间线。不得用整片提速、倒放、混帧、光流、全图形变或贴首帧掩盖失败的表演与循环。
- 按同一逻辑画布和 paintRect 对照；640 与 896 源图的整图缩略大小不可作为跨动作缩放的证据。禁止逐帧自动 fit。
- Pi 的刷新时刻应跟随实际 indexed 帧边界；DSH 的加载完成不应不断重画未来/同一帧。迟到的 HD 必须有界追赶，保留稳定回退和恢复缓冲；内存、并发及暂停/销毁约束继续有效。

## 参照、颜色与透明边缘

- 先读 docs/production/PRODUCTION-SPEC.md 与本轮 review 记录。原二维设定及色卡是材质依据；三维截图只理解结构。已经通过的角色比例、豆眉、眼线、折耳/X 针脚、短爪、白臂灰掌和单层斗篷逐轮核对。
- 不把阴影新增为毛色或材质。保留正确自然阴影，不能靠全图提亮、压暗或染色冒充守住色卡。
- 新生成输入应取干净且已认可的注册参考。若已处理视频帧有外部低 alpha 绿点，不把它再次喂给模型当权威。
- 绿色亮度先成为独立背景蒙版，反相为前景 alpha，再逆合成恢复 RGB；不删除绿色通道。白边采用已验证的显式暗轮廓边缘处理，保护 alpha 和可靠不透明 RGB。
- 远离轮廓的低 alpha 杂点可显式使用已评审的 alpha128 / MaxFilter(9) 支持清理；支持范围内软边 alpha 与所有 RGB 不变。该技术清理不意味着主体颜色通过。
- 若偏绿阴影已出现在原生源的服装暗面，不能把它归于压缩或外围 alpha；内部退回并整段重生。旧 flustered 的特定校色许可不自动扩展到其他素材。
- 2026-10-23 用户已允许新试点改用中性灰背景，并要求把紫色等方法一起尝试后择优。本轮仅对同一 joy 参考与表演设计比较灰 #808080、洋红 #B000B0、紫 #8040C0，再与已退回绿幕对照。各方法单独验证透明恢复，不把绿色公式直接套给灰色，也不把色键信号误用于白毛、灰掌或蓝围巾。旧成品流程不因此回溯改变。

## 两路检查与用户评审

1. A 路实际看颜色/材质/纹样、深浅底原尺寸软边与轮廓外噪点；B 路独立看爪、关节、支撑、比例、轮廓和全身一致性。保持用户要求的 6.1 Sol high 协助规格。
2. 先看原生源和原速播放，再定位关键/极值/首尾帧；静态接触表是诊断材料，不等于实际连续播放体验。只看静图时必须标明证据边界。
3. 黑、灰、白底共用同一 RGBA。边缘检查用无损帧，不能只凭有损 MP4 或小缩略图下结论。
4. 技术测试、内部艺术判断与用户批准分开记录；分别绑定源、参考、提示词、蒙版流程和输出 manifest 的哈希。数字指标不能自动批准解剖、表演或循环。
5. 交付页默认 1×，并排显示旧片、新候选及原参考，清楚标注原生时长和已知问题。审核过的片段才可整合；未决问题不能写成已完成。

## 已确认但需独立完成的动作缺口

公开的 wave、nod、peek、stretch、ear-flick、nuzzle、bounce、head-shake 在全动态插画线路没有对应连续素材，回退合成运动还会被整帧保护清零。它们与现有 19 段影片的质量问题分开跟踪。不得直接解除整帧形变保护，也不得把相近情绪片伪装成这些动作；后续需补真实素材或明确定义可用集合，连同自动互动、手动菜单和补全一起验证。

## 2026-10-23 灰底试点用户验收

用户在原速对照页确认「可以，按这个方向继续」。批准 joy/background-gray-v3 的笑意起落、全身配合、循环节拍，以及沿灰底方法继续 think/listen；源 SHA256 为 `04f3d230ed9ab7f3c2a7997a462ff8fa27f05dc9fb544eb6823c2ca5cf9a9bc1`。精确输出/参考/提示词哈希记录在同目录 user-approval.json。已披露的小处暖灰软边残留不被宣称为零缺陷；正式素材、安装与发布均未替换。倾听沿用既有 subtle-v5 的小幅点头约束，不因本轮有动感目标改回大幅摆动。下一批仍须两路实际校对与用户评审。

## 第二批：灰底思考与倾听

两段 gray-batch02-v1 已生成并处理，各107帧/24fps/4458ms，完整原生前向时间线；think pivot448,608 / paintRect y=0，listen pivot448,704 / y=-96，不逐帧fit。两路实际源/关键帧检查未见必须先重生的颜色或结构硬错，保留少量中性灰边点；listen闭眼停顿及点头幅度、think思索节拍仍待用户原速判断。精确源/输出/参考/两路哈希及范围记录于各job review.json，汇总 work/motion-polish-20261023/batch02-review.json。未替换正式素材、未安装、未发布。

## 第二批用户验收与第三批范围

用户在52016原速对照页确认「两段都可以，按这个方向继续」。think/listen gray-batch02-v1 的节拍、幅度和循环获得批准，包括已明确提出的倾听中段闭眼停顿；小处中性灰软边残留继续披露。各自 user-approval.json 绑定精确源、参考、提示词、输出manifest及两路报告哈希。下一批推进 wait/rest，按原状态差异设计；wait问号沿用户此前授权保持独立固定层，rest重点保留眼线/豆眉与坐姿尺度。正式资源/安装/发行未变。

## 第三批：灰底等待与休息

wait/rest gray-batch03-v1各107帧/24fps/4458ms，完整原生时间；两者固定pivot448704、paintRect(-128,-96,896,896)。wait输入只将原独立问号连通组件的alpha置零，全部RGB及组件外像素原样，沿已明确授权的图形分离；原固定问号PNG保持独立静止HTML层，不混入H3或角色帧，详见composite-layout.json。两路检查原片/关键帧未见阻断颜色或结构硬错，rest所查双闭眼线与灰眉分别保留；少量中性灰边点/轻微锯齿保留披露。wait半闭眼停顿/转正幅度、rest呼吸与落定节拍、两段循环仍待用户原速验收。精确源/输出/参考/两路哈希及范围记录在各job review.json及batch03-review.json。未替换正式资源、未安装发布，不重跑已冻结程序测试。

## 用户退回灰底边缘与换色试点

用户指出第三批白色噪点，并明确要求放弃灰底区分、换色提取alpha/蒙版与边缘修复。三处代表噪点已确认是压缩色度渗漏被旧灰距离阈值判成假opaque core，低alpha孤岛清理不会覆盖。灰底局部修补暂停；同wait clean注册输入/表演合同只更换紫#A020C0与黄#E8D600两种高色差背景，先以独立背景色差信号生成matte/反相alpha及逆合成，再查边缘。源主体染色仍需退回，不用keying冒充校色；不得将灰底提取公式硬套其他背景。两路实际检查、完整原生时间、原固定问号层、历史批准范围、未审不扩批/安装继续。既有joy/think/listen的表演批准保留，但不能把它当作这轮新alpha方法通过。

## 新色背景蒙版试点结果

同wait clean角色输入分别生成紫#A020C0和黄#E8D600；黄色v1/v2均使白臂局部冷影转暖，源色A确认退回，不继续同方法黄底重试。选择紫key-purple-v1进入待审：独立色度背景信号→alpha，固定认可前景色先验的窄带trimap逆合成，不再用灰距离封闭填孔；保留完整107帧24fps/4458ms、原注册与固定问号独立层。旧凸包/简单信号失败小证明保留，最终keyhelper已冻结。紫源的processed-edge-v2额外重建异常外界可达软边RGB；全部107帧alpha、alpha>=252 RGBA及修改区外像素精确不变。两路实际看过的000/053/106 proof与最终PNG字节哈希一致，时间/注册检查一致。少量细紫暗边与局部颜色估计局限继续披露；源、matte及postpass两路记录分别保留。精确结果在work/motion-polish-20261023/key-method-result.json及源job review.json。尚未用户批准、扩批、安装或替换正式素材。

## 换底色重生后必须重新验源节拍

用户看紫底key-purple-v1后指出「又变成慢动作了」，退回该原生表演。页面1×和24fps只证明播放未变速，不证明角色表演符合正常日常速度；换背景重生成的新源不继承此前另一条原片的节拍批准。保留紫底alpha/matte/软边重建技术，整段重新H3表演，主要小变化在约0.2–0.4s内完成、用有注意力的活停顿承接，不将一次转念铺满2–3s；幅度与移动速度分开判断。删去运动段连续quiet/tiny/gentle/slow描述，避免整体“安静”覆盖动词。两条fresh accent/checkin为同一等待语义的候选，完整原生时间与固定注册不变，禁止整体提速补救。A颜色边缘、B节奏诊断/结构分别检查，数值或接触表不替代用户原速评审。

## 紫底等待节拍重生：两个候选待用户评审

key-purple-brisk-accent-v2（源af380f9e674d0ef70c3b011c2d62f25254a20b205c37c5dd149eb249ea457410）与checkin-v2（源dbf54212c8621d646197ec8911a61488899647c62d4a4744e75ebe60bf01cff4）均保留107帧/24fps/4458ms完整原生时间，继续冻结紫底trimap与外侧软边RGB重建。全部输出帧哈希、alpha/reliable opaque保护与固定注册检查通过，仅为技术证据。A实际看两源参考/关键帧及各自000/053/106黑白无损合成，B独立看同world接触表及原寸关键帧；所查未见阻断性源色、爪/支撑或宽白边/穿孔，极细紫暗边及下缘颗粒继续披露。

候选并非同动作仅变速：accent转正抬头并短暂小张嘴/半闭眼回应，围巾披布有展开；checkin反向歪头更大、张嘴保持更久。B建议先让用户看较收敛的accent，再切checkin比较。描述性变化曲线不能证明正常速度、活停顿或循环通过。原速对照页及精确绑定在work/motion-polish-20261023/brisk-wait-review.json；仍为待用户节拍/幅度/边缘评审，未扩批、未替换正式素材、未安装发布。后续每次换底重生均须重新验源表演，不能复用旧片节拍批准。

## 紫底等待候选 A 用户批准，继续休息试点

用户在61914原速页明确选择「候选 A 合适，按这个节奏继续」。批准精确的key-purple-brisk-accent-v2原生节拍、幅度及已展示紫底边缘呈现，按同方向继续；checkin不因此批准。user-approval.json已重算并绑定源/参考/提示词/合同/manifest/两路与页面哈希，保留细紫暗边及底边颗粒披露；未替换正式素材、未安装。休息另用原认可rest注册输入，背景紫#A020C0，原RGB与注册不变；双闭眼线与独立豆眉全程保留。表演以一次胸肩呼吸、短促有支撑的重量落定和安静活停顿为主，头随呼吸承接，不能主动做整圈慢点头，也不能把睡眠变成活跃探问。休息新源仍需独立两路检查与原速用户评审。

## 紫底休息新源：v2 待原速评审

rest/key-purple-rest-v1源色/结构抽查未见阻断硬错，但围巾水平甩出、两侧披布明显展开，内部保留为cloth-amplitude hold，未交用户批准。整段重生v2后所查衣料大幅展开明显收敛，后段约3s仍有一次小余动；不宣称完全遵守提示词的微小幅度，也不把接触表当原速自然度证明。v2源SHA256为e4eb5e2272ab793d420438c9849a7668702b74fb9a10e3e274c37259a7b207c4，完整107帧/24fps/4458ms，固定896注册与640世界crop(128,96)。现用休息片完整158帧/6583ms，两边各自保留原生时间，不整体变速或同步拉伸。

源A实际查参考、0.25s概览及原寸关键帧；B独立查双眼线/豆眉、爪支撑/厚臂/短爪/整体尺度与抽样动作分布。冻结紫底trimap及软边RGB重建后，全部107输出哈希、alpha与可靠不透明RGB保护、时间/注册检查通过；A另查000/053/106黑白无损帧。细紫暗边、底缘颗粒继续披露。精确绑定在work/motion-polish-20261023/purple-rest-review.json，尚待用户原速节拍/幅度/循环/边缘判断，未替换正式资源或安装发布。等待A的批准不延伸至本新源。

## 休息 v2 用户批准，开心／思考转入紫底新源

用户在51677原速页选择「可以，按这个方向继续」，批准rest/key-purple-rest-v2本片节拍、幅度、循环与已披露的当前边缘呈现。user-approval.json重算绑定源/参考/提示词/contract/manifest/两路/页面及黑灰白world影片哈希；未安装，不批准未来生成。

下一批joy/think取此前认可灰底表演的干净注册输入与表演意图，生成紫#A020C0新源；新源不得继承旧灰片节拍批准。保持主笑—落稳—余笑与托腮找线索—短思量—回视的不同意图。joy pivot448704 / world crop12896，think pivot448608 / world crop1280；统一world anchor320608，禁止套同一垂直crop。冻结像素算法及wait/rest前景先验未调参；两份新输入可靠内区的紫前景信号最大21/37，均未超过原guard46，仅证明输入配色无明显色键信号冲突，不认证新源alpha或表演。依然先A/B实际看源，处理后看黑白无损帧与原速用户评审，不替换正式资源或安装。

## 紫底开心／思考新源待用户原速评审

joy/key-purple-batch04-v1源SHA28e12bc704d5092587058c3e1fd591a38cddd3f563b08a13b5881851bb80181b、think同版本源SHA0117a12c17d91be7332d63efcac4824c4099310778aa74be4da071c8266b9434，均完整107帧/24fps/4458ms。A实际看两份参考、0.25s概览、原寸源关键帧及处理后各000/053/106黑白无损帧；B独立实际查关键动作与爪/支撑。所查无须先重生的确定结构或主体源色硬失败；细紫暗边及底缘颗粒仍披露。全部输出帧哈希、alpha/可靠不透明RGB保护、原生时间与注册检查通过，joy/think各自固定paintRect对应world anchor320608。

表演变化须如实交用户：joy约2–2.5s披布/围巾展开，主笑与余笑的强弱尚待原速判断，不能仅因提示词要求就写成已实现“较轻余笑”；think侧向转视更明显，回视中带小笑，托腮接触与体量的所查样本保持，但停顿/回视/循环仍需原速判断。对照页左为原认可灰底表演、右为新紫底试片，均保留各自完整原生时间。精确源/输出/参考/两路/页面与world影片哈希在work/motion-polish-20261023/purple-batch04-review.json。未批准新源、未替换正式资源、未安装或发布。

## 紫底开心／思考用户批准，继续倾听

用户在53550原速页选择「两条都可以，继续下一批」。分别批准joy/think key-purple-batch04-v1本片节拍、幅度、循环及当前边缘呈现；各user-approval.json重算绑定源/参考/提示词/contract/manifest/两路/world影片与页面评审哈希。细紫暗边/底缘颗粒仍披露，未安装、不批准未来生成。

下一批先完成listen灰底方向的紫底迁移，不盲目重做原本流畅的其他动作。输入沿原gray-batch02已认可耳旁掌面、四小趾垫/一分叶中央垫、厚白臂灰掌、低弯肘及另一爪支撑，保持侧倾与小幅及时回应；不是深点头、大歪头或挥爪。新源仍须fresh A/B与原速评审。原注册pivot448704、source offset220105、world crop12896与anchor320608不变。冻结像素算法与前景先验继续，输入信号校验仅为输入配色证据，不冒充新源alpha/表演通过。

倾听batch05-v1源SHA9f287996090b1b88799b339ad1b7ba26e06794d11a4edaf3a6544c99d4c066bd虽无确定源色/肉垫解剖硬错，但root/B实际看概览及raw061后确认约2–2.75s耳旁掌体移开、肩肘腕展开，读成招手/展示掌面，内部HOLD_WRONG_LISTENING_GESTURE，未做alpha。源门槛包含动作语义与幅度，不能只验颜色/解剖而把错误手势递给用户。v2整段重生改为以持续耳旁爪姿为主约束，由眼神/下巴/胸肩的小幅回应承载表演；仍须fresh两路与用户原速审核，未修改或继承旧源批准。

## 紫底倾听 v2 待原速评审

listen/key-purple-batch05-v2源SHA2ed65e2e06b3a90c13e955d27cd8ce8fde791dde624954ddf5908b9bbf63f354，完整107帧/24fps/4458ms。A实际查参考、0.25s概览及原寸源关键帧；B独立查看耳旁爪、肉垫方向、肩肘支撑和回应极值。本轮所查不再出现v1的独立外抬招手；中段约1.25–1.75s可见闭眼/头胸小回应，2s附近恢复，2.25s后姿态很接近。没有仅因“不招手”就批准整体活感；后半活停顿是否过静、幅度/节奏及循环明确留给用户原速评审。

冻结紫底matte/软边RGB重建后，全部107输出哈希、alpha/可靠不透明RGB保护、原生时间与固定world anchor320608检查通过。A另实际查000/053/106黑白无损帧，所查未见明显宽白边、围巾缝亮岛或穿孔，肉垫/短爪/眼眉/针脚保留；极细紫暗边及毛爪/围巾外缘颗粒锯齿仍披露，白底较显。精确绑定在work/motion-polish-20261023/purple-listen-review.json；页面左为已认可灰底倾听表演、右为新紫底v2，均完整原生时间。尚未用户批准、未替换正式资源、未安装发布。

## 紫底倾听 v2 用户批准，进入害羞／小生气

用户在49737原速页确认「可以，继续下一批」，认可listen/key-purple-batch05-v2本片节拍、幅度、循环及当前边缘呈现；中段回应后较安静的后半段已明确交用户判断，不把本次认可扩展为所有静止停顿通过。user-approval.json精确绑定源、参考、提示词、合同、输出与两路报告、页面及黑灰白world影片哈希。

下一批shy/grumpy沿各自原有坐姿体量和固定注册，shy896/pivot448704、grumpy640/pivot320608，均对应world anchor320608，不能套统一贴图大小造成缩放。害羞保持两只厚爪分离不交叠、不碰甲尖，表演由眼神与头胸肩内收、回看承接；小生气保持双闭爪叉腰与厚臂，以胸肩短重音表达，不鼓成蛙脸、不改挥拳。新源先经A材质/纹样、B结构/动作语义实际抽查，再做冻结紫底蒙版和边缘处理，仍待用户原速评审，不替换正式资源或安装。

## 紫底害羞／小生气：新源与细节 alpha 复核

shy/key-purple-batch06-v1源SHA539df9a022243c9b1b96d5e29426f2f3310267acc140d98a75d760fec330269a、grumpy同版本源SHA95e4b4bc455d8f278eb1fb41c9a3e75c6de421bfa91f8bd793f64b6ebff98238，均完整107帧/24fps/4458ms。A实际查原色与纹样、B实际查爪/支撑/语义，所查无明确源艺术硬失败。害羞约3s闭眼收拢，小生气约0.5–0.75s胸肩重音伴较明显披布/围巾展开；不能直接按提示词宣称已经达到指定速度，仍待用户原速判断。

这批新增技术教训：000/053/106外缘样本通过并不能证明主体内区细线alpha正确。全帧红色特征诊断暴露grumpy086红嘴及shy001眼星局部误透明；两路实际放大确认后，processed-edge-v2转HOLD，保留失败文件。冻结紫底helper未改；独立technical derivative processed-detail-v4只恢复外界不可达、面积<=64输出像素且含native强红证据的小alpha组件，取原生源同一固定resize的RGB和opaque alpha。v3近红距离守卫过窄失败历史也保留。此为具体蒙版误判修复，不是重新绘制表情或全图校色，不能推广成任意孔洞填充。

v4全107帧验证红特征抽样alpha最低252，无低于200的采样；全部改动均未触及8邻接外界可达软边或可靠opaque，时间/固定注册/全帧哈希一致。两路又实际查看已知坏帧放大与000/053/106黑白全图，所查缺口恢复、爪支撑及配色未出现新硬错；细紫暗缘/毛尖颗粒继续披露。A旧HOLD报告与新detail-review-A/B分开保存，精确证据在work/motion-polish-20261023/purple-batch06-review.json。两条均待用户原速节奏、幅度、循环及边缘验收，未替换正式素材或安装发布。

## 害羞／小生气 v4 用户批准，继续难过／哭泣

用户在54319原速对照页明确选择「两条都可以，继续下一批」。分别批准shy/grumpy key-purple-batch06-v1的processed-detail-v4所展示节拍、幅度、循环、边缘及内区误透明修复；原v2/v3失败历史不批准。各user-approval.json已重算绑定精确源、参考、提示词、合同、v4输出、A/B与detail报告、页面和world三底影片。未替换正式资源或安装。

下一批sad/cry取已批准的原静态注册参考，sad来源acting-unified-v6、cry来源acting-water-v4，均固定896/pivot448704/paintRect(-128,-96,896,896)。难过保持完整卷爪/隐藏拇趾与连动的失落呼吸，不逐肢演示；哭泣以不等强弱哽咽、近眼爪支撑与重心为主，保留当前已获批的清水流下/脱离落珠方向，不能笼统把现版说成仍是黏泪。新源经A材质/纹样与B结构/语义实际审查后再处理蒙版，内区红细节和水滴轮廓另查，仍须用户原速评审。输入配色signal检查仅说明参考与冻结紫色guard不明显冲突，不批准新片。

## 第七批内部返工与不透明内区规范

sad/key-purple-batch07-v1因中段明确笑嘴退回，未跑alpha；v2源保留未解决的难过，约1.75–3s收拢和披布侧展较明显，幅度交原速评审。cry v1早期概览未看清脱滴，补查033–048局部已确认泪珠脱离下落；不能因上方仍供水就认成黏泪，也不能把初步怀疑写成永久失败。cry v2落珠更直观但后半表演较重复，存备选，当前选v1。

sad v2暴露旧蒙版在眼星内部形成假透明。小组件面积门槛、参考色域/强色证据路线均保留失败历史，不能只看084某一侧或恢复像素数便宣称整帧已修。停止反复扩大阈值后，改为明确前景trimap：仅此固定正面片使用[340,340,560,490]的已核不透明面部core，A/B实际看000/012/042/054/084/106叠框及额外原寸极值。完整107源此core与实测紫背景有至少31byte最大通道差；所有实际改动与8邻接外界、core边界、可靠opaque均分离。processed-detail-v7只把core内不可靠alpha恢复为原native同注册RGB/255，未改衣料外缘、体外水滴、可靠opaque或原生时间。known-truth含真实key孔的错误core会拒绝执行。

后续工作流：对人物内部已确定实心的眼星/嘴线等，不将前景颜色混淆当成艺术重画。先定义并实际验证该片完整姿态范围的不透明trimap，再恢复内区；无安全固定core的转身/大位移动作需另立方法，不能套本坐姿框。面积/强色阈值不能替代结构证据。单帧示例、首中末抽样或数值保护均不足以盖过已知反例；必须重查全部帧的目标诊断，并实际看全部已知坏帧与黑白底，才送用户原速评审。

## 用户退回第七批：掌体／四趾读感与配色

用户指出「手越来越小了，而且有色差」「手又变成了三指一样」，当前#sad；整批HOLD，不扩批/安装。结构复核确认sad新042–072抬爪靠下巴时灰掌变窄直立、掌腕过渡拉长、拇趾根侧体积丢失，三排趾线与指甲成为主要读形。首帧接近原图、能解释遮挡、没有明显断肢，都不足以证明动作中的掌体与四趾拓扑稳定。撤回此前以隐藏拇趾可能性放行的依据。

配色复核所查同世界内区表明差异主要已在H3原片：sad白臂偏粉紫，帽披蓝灰发闷/偏紫；围巾略变化，灰掌颜色接近原正式片，不能笼统写全身每种材质都错。raw与processed相同位置相同RGB，不通过额外matte修复或艺术校色掩盖源色差。原色卡与原认可static/正式片同时对照，关注阴影层次而非只排除大片绿紫污染。

下一步仅sad单动作原片试点：用原认可registered static，掌体保持胸前圆厚宽度与短腕衔接，随胸肩作较小肘爪调整，取消明确「三趾在前、第四趾藏后」的生成措辞，不硬补第四枚甲。先同底源／输入原图验四趾整体读感、掌体相对头/臂的体量与材质层次，两路实际复核＋用户源片评审，再做alpha；不得继续先抠图后才发现源结构失败。新任务455298252575133，自动重试0，正式资源不变。

### 四趾静态试点，视频暂不扩展

H3任务455298252575133的新原片虽恢复较厚掌体，A/B实际看后仍判第四趾读形不足、白臂轻微粉紫漂色，保持HOLD，未运行alpha。改用原认可sad整图为风格/动作基准，原二维paw-anatomy与natural-fur-colors为结构/材质参考，用imagegen整图重生静态试点，不在错误原片上补甲或局部绘画。v1仍双侧三趾、v2右侧仍三趾，均保留退回。v3两爪各四个可辨趾端/短甲，经两路实际看图同意送用户静态评审；外侧趾分节较浅，不能只靠数指甲批准。原生透明输出底边仍有零碎alpha边缘，此图不是可直接发布的成品。

候选与来源哈希/实际复核结论保存在Hi-Res/sources/h3-motion-polish-20261023/sad/static-paw-pilot/review.json。v3尚未获用户批准；先验爪形、掌体比例和配色，获准后再用H3验证完整动作中的体量、趾结构、材质与节奏，最后做技术蒙版与边缘修复。静态通过不等于视频通过，正式资源与安装均不变。

用户随后明确退回v3：「爪形或比例还需要调整」。状态已改USER_REJECTED，不得将两路“可送评”意见当作结构验收。停止用凑齐四枚可见甲作为试点目标，重新并看原二维紧凑趾团、掌体与短腕衔接；用户具体原因尚待确认，代理观察不能冒充用户反馈。该静态不进入H3，不替换正式素材。

### 用户决定保留原展示难过视频，停止静态返工

用户具体指出「趾头太像人手，应该更短圆紧凑」；v4仍卷拳，内部退回。v5已启动后，用户在54268/#sad明确改为「就按照刚才的视频吧。问题不大」。按最新决定停止静态路线，v5仅存历史、不再请求其评审或用于替换。原展示sad/key-purple-batch07-v2/processed-detail-v7现获用户接受；其爪形/体量及源材质色差作为已知可容忍偏差保留，不声称已修复。精确源与manifest、三底原速影片及参照哈希已绑定该job/user-approval.json；其他未展示H3、静态v1-v5、cry与安装发布不继承本次认可。哭泣动作单独评审，正式资源与安装未变。

用户随后单独认可「哭泣也可以，继续下一批」，精确绑定cry/key-purple-batch07-v1/processed-edge-v2，user-approval.json SHA b28f6ebb0f5660291668d46eaed4c5639f53f3a8e819d0c8b6ee6799370d0804。第七批两条均保留，停止重开静态爪形。下一批flustered/surprise使用各自原认可的brisk-v2（仅右侧两小汗滴）/curious-catch-v3 clean registered，原生短促整体表演与既有世界锚点不变；新源先实际核材质与兽爪/支撑，再透明处理。旧flustered窄范围艺术校色许可不扩张到新源，未安装或发布。

## 第八批惊慌／惊讶：原速待评审

原源失败历史保留：flustered batch08-v1新增第三枚汗滴，surprise v1过静、v2背景变青绿且符号消失，均未进入alpha。当前选择flustered/key-purple-batch08-v2源9c84ba7062000d89cd68571c7603ddb6be7212c0be030e68f7640b7da98a22af、surprise/key-purple-batch08-v3源8ecfd772f4473b159cde5778eaf4c76ad9fcb2fc5035cf63156f684be8e75ebf。两路实际看源检查材质与兽爪/支撑后才处理透明；不将源色差用校色掩盖。

两条冻结紫底技术输出仍出现眼星内部误alpha，各自独立review六种源姿态与完整107帧前置条件，确认固定[340,340,560,490]均为实心前景；源对key最小差分别42/38byte，core边界、8邻接外界与可靠opaque保护。各自processed-detail-v3仅恢复同帧同resize原nativeRGB与内部alpha，不动外围汗滴/黄符号柔边，不改表演或材质。最终107帧红/珊瑚脸内样本低于200alpha均0；全域剩余低alpha位于外围颜色软边，不能机械填实。A/B实际重看已知坏帧修后黑白及局部，旧edge-v2 HOLD报告保留，最终报告与精确哈希见work/motion-polish-20261023/purple-batch08-review.json。

原速对照http://127.0.0.1:56379/，两条完整107帧/24fps/4458ms，无整片提速/倒放/补帧。惊慌012披布侧展及后半较安静闭口停顿、惊讶黄提示符在部分眨眼转姿中短暂不可辨随后回来、细暗边/毛尖颗粒均披露。两路样本“可送评”不等于用户验收或全帧无瑕，当前仅等待用户原速节奏、幅度、循环和边缘观感。未替换正式资源、安装或发布；下一批尚未展开。

用户第八批反馈「惊慌不如原来的版本」：保留当前正式brisk-v2原动作及已批准color-batch-04派生，不选择batch08新惊慌，不重新生成/校色。正式源SHA33ff3b1c80acca8046ed22699f13470159f7d4951cb08534b07beef2ef0d0727、motionManifest70ae60085221bd76399fc2cd4c567a37a03755e83b922ef62db4c8f55610190c，绝非被拒brisk-color-v4。精确catalog快照与用户决定见work/motion-polish-20261023/flustered-retain-original-decision.json；新候选保留历史但replacementAllowed=false。惊讶未获明确反馈仍单独待评，不将该回复扩张为惊讶通过。改善不强制全部换新；原片表现更好就保留，避免为统一版本再次削弱表演。

用户随后单独认可「惊讶新版可以，继续下一批」：绑定surprise/key-purple-batch08-v3/processed-detail-v3与user-approval.json SHA e98d7973edf1443d79e6782ef238d292346d3bf4655757bdd725b3374a7cd4a3；惊慌仍保留正式原片。第八批选择完成，新旧混合按动作取优，不扩张新惊慌批准。第九批proud/affection从原批准输入生成：proud原闭口图首尾、已认可单颗小虎牙咧嘴仅中间参考（Ref2VA）；affection原单层下摆图与既有独立三心图层。A/B源审、独立alpha/边缘和用户原速关卡仍在，未安装或发布。

## 第九批小得意／喜欢：原速待评审

proud/key-purple-batch09-v1源a5c3f770b7d80bd186b0c5476becadfe1fc13a2cfb11e69ad1eae3893747fbb1，保留原闭口图首尾与已认可中间单小虎牙微笑的不同职责，采用Ref2VA双参考，未将中间笑图误作边界。affection v1两侧下角上翻，源HOLD未入alpha；v2源6a3708951fa27b24254622a43decaa0878d7578ec61dcbaefcf67f92de8f84d9收住单层向下下摆。v2原生三颗心已有大小/位置变化，两路实际确认保持左二右一，因此保留原生动态、不额外叠加重复心层；旧批准独立层继续仅作参考。

两条新源各自A/B实际审查，并独立看六姿固定脸core叠框；完整107源此core相对key最小差40/55byte，后处理仍逐帧验证ext8/coreboundary/reliableopaque保护。最终均processed-detail-v3，proud恢复6431个内部误alpha像素为同nativeRGB/255alpha，affection恢复0像素（本已可靠，不能虚称修过艺术问题）。完整107脸内强红/珊瑚诊断低于200alpha均0；外星形/心形边缘有合理半透明，另看实际位置，未机械补实。A/B各实际重看000/054/106黑白与源，所查无新核心孔洞、接缝或宽白边，细暗缘与爪/围巾毛尖颗粒继续披露。root另看affection015白底及proud054黑底，未将外符号软alpha误当脸孔。

原速新旧对照http://127.0.0.1:60773/，完整107帧/24fps/4458ms、世界注册不变；原速表演、幅度、表情感染力、循环仍待用户。精确源/输入/中间表情/输出报告哈希在work/motion-polish-20261023/purple-batch09-review.json。未替换正式资源、安装或发布，不将内部抽样检查冒充用户通过。

用户先反馈「其中有动作保留原版更好」，随后明确「喜欢保留原版」。保留正式quiet-volume-v10本体＋hearts-overlay-v1独立三心动态及color-batch-05批准像素；正式source e77ad6baada322ecf6e8c5ff7c13bad2d4f0522df1bf415bc2dfa4ab362003a0、motionManifest 5d71b49cc3e00de6dcbacd204eaa29efb9c81ab04ea3aedbe6785acebea53ec9。新batch09 affection v2仅存历史，replacementAllowed=false，停止此动作返工。精确决定与catalog快照见work/motion-polish-20261023/affection-retain-original-decision.json；小得意未因此自动获批，仍待单独确认。正式资源未改动。

用户随后明确「小得意采用新版，继续下一批」，绑定proud/key-purple-batch09-v1/processed-detail-v3，源a5c3f770b7d80bd186b0c5476becadfe1fc13a2cfb11e69ad1eae3893747fbb1、manifest a920180fa087a0599ef8fb2628d7b3fcd523d90a0f8d3de323070004a971ad5a、user-approval.json 439e977ce32a0f3d1d517556bf723bfa5257dcd4e4cd7e77d87e3c2ca37e10cc。第九批选择完成：新版小得意、正式原版喜欢，停止喜欢返工；仍未集成、安装或发布。

## 第十批待机／放大镜：原始二维与已有640锚点

以原二维idle-open/watch与runtime-registration既有记录准备640画布：统一456×608、offset分别[92,19]/[92,8]，pivot[320,608]、paintRect[0,0,640,640]。原RGB不校色，仅将原alpha250标准化并合成#A020C0无光照紫色平板；不将旧1280参考简单缩小，不照搬前批896脸core。两路已实际看输入与规范，放大镜初始镜后内容为脸颊毛/帽布，后续移至眼前才要求真实对应蓝眼放大；镜面不机械挖洞或填白。新源与输出仍须分别实际A/B复核和用户原速关卡；未批准前不替换正式资源。

watch batch10-v1源d8df9068b0a0c34997cca8c618cd89cde99d0d5862e7c9dbdb08d55ed6e8b8ac虽实现镜中眼睛放大，但042/048披布两侧近横向翼展，B/root源HOLD，未运行alpha。v2以完全相同二维输入重新生成，明确下摆落地与上胸小倾，保留失败历史而非脚本修布。idle-v1源8240e205c78bf4f1c019293a547ddb9aea9af6255302e463efd006183aff0d62已通过两路源审：双爪厚度、闭眼线/豆眉和稳定落地支撑所查成立；中段疑问式小撇嘴作为待用户判断的表演变化披露，不称全段始终微笑。

最终待人审为idle-v1与watch-v2（源9e728f52c87ce080092b1bc8b333e02c9dbfec4c09d2649a5a7da2da7f1c2993）的processed-detail-v4，完整107帧/24fps/4458ms，固定640世界注册；manifest分别45feb3a8daca20fbfea77f2c04134031bff6365d5a605d5b6c2c62c9f787c4cd、c710a178711590d55f2e869300b3f2c10f71370a09850d4c4b15406c211238fb。紫底trimap与外围柔边RGB处理保留原时间，不用源校色掩盖艺术问题。

新640实心底层脸区独立看六姿并逐帧验证：watch[225,280,420,375]，不延伸到真背景透出的玻璃；idle初始同框在025等星点触左边界，被guard正确拒绝，partial detail-v3留历史；另行两路重审idle左界210后使用[210,280,420,375]，未放宽ext8/coreboundary/reliable252保护。v4分别恢复4186/317内部误alpha像素为同帧同resize源RGB，全107强红/珊瑚脸部样本alpha<200为0。两路最终实际看已知坏帧、闭眼/玻璃及黑白输出，无所见core孔或矩形接缝；仍披露细紫暗轮廓、毛/爪底缘颗粒，不声称全帧无瑕。

原速新旧对照http://127.0.0.1:57255/，黑灰白切换与两动作切换可用；页面披露待机中段疑问小撇嘴、放大镜较长专注停留。source/output两路记录、输入/源/manifest与三底影片哈希绑定于work/motion-polish-20261023/purple-batch10-review.json。仅交用户原速节奏、幅度、光学和循环评审，未替换正式资源、安装或发布。

用户本轮明确「放大镜保留原版 待机没问题」。待机采用idle/key-purple-batch10-v1/processed-detail-v4，user-approval.json SHA64f675c8ac1caf8ca4655dcbc1a062ab68f127dc929612c7adb9d9d371525fd0；放大镜保留正式源66d5eda18e7ff3e0a545d3f2c56463cf07bb4dda85e79371f7b889ba2566cdc9、motionManifest cec63b8e729e9efd614d42e16c38be8badeb634d6b6b784e6b02df1b625516e4及color-batch-07批准像素。watch batch10-v2仅留历史，replacementAllowed=false，停止重做。精确snapshot与决定见watch-retain-original-decision.json，第十批选择完成，未集成安装。

## 第十一批：保留原打字／埋头搜索与键盘链，核对新待机接入

按当前正式catalog的paintRect分别合成640世界预览，不将896转场整图缩小冒充角色缩放。A实际看四张时间表、原二维/适用键盘参考及work071/search052/exit010；B实际看四表和已注册边界。两路均建议保留正式work/search/work-enter/work-exit，无可由静帧确证的优先重生阻断；不为统一全部换新。原寸透明WebP的外围亮黄RGB不能直接判材质污染，所查退出010黄块alpha≤26，仍披露低alpha彩边/毛尖颗粒。

新增边界图单独并看新idle106→formal enter000、formal exit023→新idle000；两路所查头身/帽顶/双掌基线和服装材料兼容，无明显整身缩放，但眼高光、嘴颊、毛/爪甲纹理和围巾明暗有细小跳切，旧退出略闷灰、新待机较清亮冷白。不能称像素相同或凭静帧认证动态无缝。报告在work/motion-polish-20261023/batch11-audit的material-review-A、structure-review-B与idle-chain-review-A/B.json。

连播评审包含原链与新待机接原链、单独原打字和埋头搜索。原loop24fps与各400ms的60fps进出场保持原时间；预览文件以120Hz共同时间格精确重复持有原帧，无插帧/改速，仅为检查跨片边界，绝不据此改变发布格式。新链16.3秒、原链20.55秒差别来自待机片长，不能当加速证明。尚待用户原速接缝与整体观感；未替换正式资源、安装或发布。

用户已明确「衔接可以，按这个组合继续」，精确绑定batch11-audit/user-approval.json SHAd6fe407abd9b9897ffc7005dc17f8256c64bb5d0f80e03b3241b15832a6c36b8。新idle与原enter/work/exit组合通过；原search/watch继续保留，预览120Hz不作为发布帧率。主19段选型已锁：12条新片＋7条正式原片。逐条actual user-approval与源/processed manifest、帧PNG的哈希均核验于work/motion-polish-20261023/approved-selection.json，不从目录名猜“最新”。保留的七段为affection、flustered、watch、work、search、work-enter、work-exit；停止相关无必要返工。

## 已批准动作内部alpha收尾：等待与倾听

早期只读诊断flag现已实际查看：wait028、listen051眼星细缘会随黑白底变化，确有小量实心脸内误透明，不是源片需重生。wait原[340,340,560,490]候选完整107帧含key（min3），拒绝并保存initial-candidate历史；重新收窄为[370,350,560,480]，min36。listen专用[340,340,560,490]，min52。两路实际看六姿/已知缺陷并独立记录专用授权，未机械继承旧896或640core。

processed-detail-closeout-v1只在上述实心脸区恢复原alpha<252像素为同帧同固定resize的源RGB/255alpha；写结果前先完整107帧ext8/coreboundary/reliable252/框外保护预检，不通过就拒绝。最终helper另完整重算214帧，确认与输出RGBA逐像素一致；所有PNG/WebP完整decodedRGBA一致。wait恢复5581、listen2987内部像素，时序/注册/外围alpha/爪/独立固定问号不变。源演技批准保留；本轮不重评动作或擅自校色。

最终manifest wait ac3688860e6b37420ea4f27f7f563ba2664b51502c7ea655c650e8a4a890601e，listen b1d65751fb89571952ed11efbff1598643d762cae5c21460d50a5ddd4db84674。完整107强红/珊瑚脸部样本alpha<200均0；wait剩余21外软边单点（如086[614,542]）未机械填补，listen全域相应flag为0。A/B实际复看已知帧黑白/源与旧版，无所见内部孔或矩形接缝，细暗边/毛爪底缘颗粒原样披露。原速及无损同帧对照在http://127.0.0.1:63361/，绑定early-alpha-closeout/review.json；此技术输出仍待用户确认，未覆盖选型中原已批准variant，未正式替换安装。

接入约束：保持640世界和按clip的paintRect，不按逐帧透明bounds缩放；等待的已批准固定question-world层必须在两端保留，不能只存在预览页；说话口型、DSH静态标题和原像素资源保持既有分流。更换catalog revision时同时更新受其校验的索引metadata，保留原片者的动作像素、调色板、时序不得借重编码改变。新素材进入隔离stage及Pi/DSH构建后再做真实运行/验收，不把媒体评审冒充安装或性能通过。八个旧辅助手势尚无新连续source映射，继续保留其既有回退和保护，另列待办。

## 两端接入与发布命名（2026-10-23）

用户已明确「修复版可以，继续接入两端」；technical-alpha-user-approval独立绑定wait/listen收尾输出，不覆盖原演技批准。选型SHA为3f32d31e18fea7c60a9189652a0992644e93bcd23749a703437a9b7b57d8abc4。隔离源码位于dist/motion-polish-20261023/integration-source，候选版本2.5.1-preview.1，正式基线2.5.0和本机安装不变。

独立B路严格stage校验已通过：1284张新HD实际decodedRGBA逐像素核验；7条保留动作完整解码数据仅revision变化；Pi原始时间每两帧采样、等待固定问号、640世界与逐clip paintRect、400ms键盘链、原像素、静态标题和独立口型均核验。发现并修复正时间83.333ms经双取模回落到前一帧的浮点边界问题；保留精确边界、负时钟及循环末尾回归，不调整源片节奏。

用户要求DSH名称使用dsh-前缀、Legacy独立tag线。未来DSH下载附件为dsh-furry-partner-full-animation-<version>.tgz；Pi为pi-furry-partner-full-animation-<version>-pi-core.tgz。内部package/插件标识为升级兼容保持原值。main使用v2.5.x及后续标签；legacy分支使用legacy-v2.4.x，只接受2.4.2起的稳定修订，明确Legacy标题且latest=false。历史标签与附件保持原样；本次未创建标签或公开Release。

本轮仅构建、归档回读和解包生产读取器验证；实际宿主安装与视觉/性能验收另行记录。19段主动作的接入不代表八个旧辅助手势已获得新连续素材，不能借此宣称所有动作重制完毕。


## 辅助动作恢复与随机待机（2026-10-23）

用户已分别通过nod/key-purple-pilot-v1的原速源表演与processed-detail-v1透明边缘，并明确要求接入两端、继续其余辅助动作。正式目录已新增nod作为第20条完整动作，源/透明/量化/完整时间/用户批准与A/B记录冻结在assets/animated/provenance/auxiliary/nod-v1。原19条高清RGBA与解码像素/时序/QA保持；二进制顶层revision随新缓存版本更新。真实Pi1.3加载器、图像传输和DSH控制器验证手动/自动都播放到末帧106，4458ms后结束。尚未构建包含nod的新安装包、安装或公开发布；此前preview.2双包是19片代码修复快照。

用户追加待机只向左看太机械，要求多个动画随机播放或自然循环。新增素材先以center正面放松与right右侧留意两源试点，各用原批准idle640注册、固定pivot320608与原图首尾，避免镜像破坏折耳身份。两片未通过最终透明原速评审前不进入正式idleVariants。

共享播放器只从明确列入idleVariants、QA已通过、同paintRect且可循环的完整素材中选择。一次完整周期内不换片；边界随机选取并避免连续同片，预取下一片；暂停/任务打断和迟到恢复有界处理，不回放后台积压循环。两端不改变帧率、姿态几何或人物尺度。原目录没有variants时完全沿用既有单片时钟。fixture与真实DSH渲染测试仅验证代码行为，不批准新源表演或透明效果。


### 三待机与挥爪：用户批准后接入（2026-10-23）

用户在多待机／挥爪原速评审页明确通过「两条新待机都可用，接入随机轮换」与「挥爪可以，接入并继续下一批」。正式目录由20条增加到23条，idleVariants只列原idle、idle-center、idle-right；挥爪按完整辅助动作播放，不以表情回退充数。新三片各107张高清／54张Pi原时间抽样，保持固定640世界与pivot320608。旧20片画面和QA不变，缓存revision随目录更新。

本轮批准冻结原生源、最终透明manifest、A/B实际看图记录以及64533评审页的配置／服务脚本／页面哈希。已披露并获接受的右看三分之四幅度、挥爪短笑／牙与细暗边不再反复重做。两个新待机只在完整周期边界进入随机池，不能每帧重抽、提前截断或镜像旧左看。点头与挥爪已补；探头、伸懒腰、抖耳、蹭蹭、小跳、摇头这六项继续分批制作和用户评审，未批准素材不进入正式目录。

此次为源码接入；本机安装与已归档preview.2双包仍是之前的快照，不含本轮23片更新。下一批探头／伸懒腰只在独立评审页提供候选，不能冒充已安装版本。


23片接入验证已完成：work/motion-polish-20261023/idle-wave-integration-validation.json绑定revision animated-idle-wave-v1-982b8e51ea8b21af与catalog SHA5404b3216912fcda6a826c249fc8f058dd55f07a10bc3fa3f8146d3b499a923f。新321张HD完整RGBA与162帧Pi量化重放一致；旧20片HD/QA与索引解码内容除revision保真。真实Pi1.3 loader/editor/image transport和实际DSH控制器均验证三条待机完整4458ms／末帧106后非重复交接，挥爪手动与自动同样完整播放；源仓库两端完整回归通过。

另执行tools/build-editions.py --edition full-animation --platform all --prepare-only --test，独立stage中的Pi和DSH完整测试均exit0；构建stage补齐tools源码审计依赖，实际运行包仍按npm files与发行过滤规则排除生成专用媒体。此检查没有重新生成大tgz、没有安装、提交或发布。stage记录位于dist/releases/auxiliary-23-source-validation/prepared-editions.json；不能用旧19片归档冒充当前23片安装包。


### 探头／伸懒腰v1否决与方法调整

用户在53562最终原速页否决两条，并确认原因：探头像另一条普通侧看；伸懒腰只抬肩抬掌，缺少伸展和释放。两片各自user-rejection.json及review.json标为USER_REJECTED，禁止进入正式23片目录。原技术alpha检查通过仍有效，但绝不构成动作表现通过；源检查只查没有明显结构错误仍不足以送片。

新方法先做有明确意图的峰值参考，再生成连续动作。依据Animation Mentor的[可读姿势与承重教程](https://www.animationmentor.com/blog/tutorial-building-appealing-character-poses-for-animation/)及[预备动作原理](https://www.animationmentor.com/blog/anticipation-the-12-basic-principles-of-animation/)，先检查姿势的意义、轮廓和身体重心，再组织准备、动作峰值与自然回落；不机械逐关节排演，也不把全段持续缓慢移动当成流畅。以上是本次设计取法，不声称外部教程直接批准新角色动作。

auxiliary-keypose-v2内保存原idle与爪结构参照、imagegen完整提示词和输出SHA。peek峰值为前掌前移支撑、肩胸一起前探；stretch峰值为两前臂展开上伸、胸背舒展，胸腰截断无新脚。第一张stretch多出下方双脚已HOLD留历史，不用作H3输入。两幅合用峰值经本轮A/B实际看输入，只准作中段意图；身份、固有色和neutral开闭仍原批准idle，不把新近掌透视或白胸腰长度升级成比例许可。

H3改用已经验证的双reference_image Ref2VA构造，而非再用同neutral首尾FL2VA造成微动。提示原idle开闭、峰值在中段，但Ref2VA不提供强制逐像素首尾保证，必须检查真实源的回落与循环。新源先对照峰值看是否确有可读探身／伸展，明显退化成侧看或耸肩即HOLD，不先花工跑完整alpha；通过后仍按紫底蒙版、边缘保护、独立内区guard、A/B最终输出及用户原速关卡执行。正式目录与本机安装不随候选自动改变。


伸懒腰v2在源代表姿势材料门后，完整107帧守卫发现039–045及070–077的横展过渡截掌，原生帧复看确认并HOLD_SOURCE_CLIPPED_PAWS；未用alpha修复、加空白外框或弱化守卫冒充找回缺失。以后源门先扫完整时间的最宽过渡，不只看峰值／每六帧接触表。源接触表与材料代表帧PASS不能覆盖构图截断。

v3按同一逻辑世界扩大固定余量：原neutral640与峰值640只做原像素pad(+128,+128)到896，不改变人物比例或颜色；源输入pivot448736对应原world pivot320608，paintRect(-128,-128,896,896)。沿用已有896键盘过渡的固定注册方式；最终也保留整张896，不裁回640。新源完整107帧最小外余量80原生像素／约93.33逻辑像素，无触边；实际起势仍晚于提示词且峰值hold较长，必须原速披露，不能按提示词时长宣称达成。

跨两条评审时，peek640透明输出仅原RGBA数组paste到896的固定offset128；stretch896输出原样使用，原待机640也pad128。两条在同一896评审世界按相同人物尺度比较，视频仍24fps／107帧，PNG裁回与原数组逐像素相等。不能把浏览器按宽度显示不同画布产生的缩小当作人物实际尺寸，也不能用评审pad代替源端补全截掉的掌体。此为固定合成与技术注册，不是局部画改、插帧或重定时。


### 伸懒腰通过与完整注册接入

用户在50097原速页明确「伸懒腰可以，探头再调整」，随后确认探头问题是爪子。stretch/key-purple-pilot-v3/processed-detail-v1独立冻结user-approval，绑定manifest80e799989b9aa5cc03f11b68c792dee0f2fd9e0e0e38308c6c15f58413d913cd及页面evidence0d13bbeafae6ad28753569794db27d49356b6540b1fcef3d1760051fad794d56；先前起举/hold/细暗紫颗粒/原生模糊披露保留，不自行校色或重演已批准伸懒腰。

正式目录新增stretch到24条。HD整896直接保真；Pi以336×336保存完整896源，仍为每逻辑像素.375索引采样密度，54个原生偶数源帧与4458ms不变。raw.viewport.worldRect=[-128,-128,896,896]，worldAnchor[320,608]、bitmapPivot[448,736]；原23片HD/QA/解码内容除顶层revision保真。

Pi只对noncanonical注册viewport增加显示映射：身体核心宽高保持，使用既有caption两侧空隙显示横展；窄终端为整个Main稳定保留至少左右10%横余量，避免只切动作时挤动编辑框。不将整336图塞入原核心宽度。保留原336源，只在显示层按固定world坐标采样，实际全107源上下可见范围均在原640世界内。DSH索引回退直接使用同paintRect，与HD定位一致；独立标题继续titleSheets分流，不被辅助动作取代。

新增approved-motion-viewport测试以合成标记验证核心尺度/锚点、原buffer不改、左右越640掌保留与拒绝坏rect，并对实际54帧×3终端宽×4尺寸的648次显示检查前景索引数完整。曾发现compact14列半像素浮点floor造成重复/漏列，已改为source-index affine并固定边界误差；全部648通过。完整宿主与套件证据另由本次集成validation绑定，源码接入不代表本机安装或新归档发布。

探头v2独立否决，实际看原idle/峰值/原生最大承重帧：前掌趾瓣长而分散、有独立侧指感，最终与源一致，不是alpha抠掉。新v3整张keypose改为紧凑短厚承重掌；原idle负责形态/配色，坏v2仅参考前探动作线，不能继承其长趾。实际新源A/B通过后继续技术处理和用户门，未批准前不接入正式24。


24片最终验证已完成：stretch-integration-validation.json（SHA3ad617c161ebfd6ce631331d98530a342fef4795ae8c671bafa0f8328084d4f5）绑定revision animated-auxiliary-stretch-v3-679b1c550d4dd9f5，catalogSHAa64ed283774272327533c77e277d469c3b5a9575e02dbc96f8fef56bdc932eb2。107HD/full896与54Pi/full336逐像素量化重放一致，保留1428个旧640窗口外前景索引；真实Pi全54帧图像传输及DSH高清/全部索引回退未丢前景，尺度与待机相同、手动/自动完整4458ms到源106。Pi与DSH完整套均exit0，独立build-editions prepare-only --test两套亦exit0，stage报告在dist/releases/auxiliary-24-source-validation/prepared-editions.json。没有重建tgz、安装或公开发布。

全套另捕获普通/暂停画像命中范围被扩大到整caption的回归，已修为仅实际noncanonical大画布显示时扩大；普通画像仍仅核心16列可点，邻空白不poke。Main窄终端稳定caption至少20列，79列时核心居中offset2；鼠标测试更新明确布局预期但保留所有边缘可点、邻空白不可点、选择输入/草稿/配置不变的严格检查。旧失败日志单独保存，最终Pi全套重跑通过，不以DSH通过替代Pi通过。

探头v3最终manifest8ff214d7aec9f1173fda91ba08ed55e957a67212fe73326202cc0b7df5a27a76经实际A/B与完整107透明守卫通过；659内部误alpha恢复、外边界和原时序不变。52855新旧对照页左为用户退回v2，右为新v3，下方固定世界同帧近掌放大，不自动按帧追踪fit。页面/原始输出/相同896评审pad/三底24fps107视频及A/B绑定于peek-paw-v3-final-review-evidence.json SHAede4eb0a0531e714bd8af5995d0b485e97bfca18c53603cbd7e67612952560d0（本地工作区）；新片仍待用户爪形与原速门，不加入正式24。伸懒腰不再重复征求艺术批准。


### 探头v3否决：双爪原位，表现转移到视线与上身

用户对52855的v3明确回复「还是有问题，不要动爪子了吧」。这覆盖此前内部A/B的可送评结论：v3未获艺术批准，不接入正式24片；原源、透明检查和评审页保留为失败历史，不回写成通过。伸懒腰的独立批准与24片验证保持。

下一版收窄为两只原待机爪原位支撑：不前移、不抬、不张开，不另造近掌透视、伸长趾瓣或露出多余指甲。好奇感交给眼神先聚焦、颈部和肩胸真正向前探、随全身呼吸自然回落；不能退回v1仅普通侧看的问题，也不把身体各部机械分段排演。原idle二维registered-reference负责爪形、身份与配色，v2/v3前伸爪不是新动作目标。

两路子代理继续实际分工：A材料/色卡/图案，B支撑/解剖/动作意图。新H3源先查完整107帧爪位与形态、最大前探和边缘余量；源爪明显变形或位移则尽早HOLD，改变提示构造或重生，不先长时间跑alpha。之后才独立紫底蒙版、外围边缘、实心内部误透明守卫和最终A/B，再交用户原速与稳定支撑评审。不得以用户要求“爪子不动”推定允许脚本贴静爪、局部艺术改画、提速或合成遮掩坏源。


探头v4已按双爪原位重新生成：仅原idle同首尾FL2VA，单次H3 source be074ea007fd3ecd4f32a1abfc190afb0d2208a4ddfc747280a47ea1a4f4d9a2，不使用v2/v3伸掌参考。B实际完整107固定爪区接触表未见前移/抬掌/张开/长指瓣；颈肩胸正向轻前俯，幅度克制、约1秒后更明显起势、中后hold较长，保留用户原速门。

最终processed-detail-v1 manifest898683f7f1b4d3f87ee0f189b954904e0f5d77c3bd32472d6664a06a47b59a9a，独立本片实心眼框恢复1283误alpha像素；107帧双爪相对edge RGBA精确不变，原时序注册、PNG/WebP和保护守卫通过。A最终a4fb93f80e320d54a813e52c603af445180ee8437f703de7bf711ea0d840fc62实际补看060，明确外缘仍有细绿/黄点及暗紫颗粒，定点与旧edge相同；不声称完全去净。B最终2887d6b7c40f800c9b16f950bdb39c3d8eddcb4e6250dfc1691d329c11c15a6c。当前汇总review7df24eb73106966fe524f15d19f72ee78e92c5f8c7444c24963f45dcd2dc21e0正确绑定最新A，旧聚合cc7da13快照保留，不覆盖历史观察。

原速新旧评审http://127.0.0.1:53460/，固定pad128到896仅评审，全部107原RGBA及24fps保持；黑灰白底和同帧双爪放大可用，原idle旁列。页面证据peek-stationary-v4-final-review-evidence.json SHAa784ba72202848c71095c557bd788e6c281a652a37d1dfdc73549f84626836a9保存在本地工作区。v4艺术/原速门仍待用户，正式24片catalog SHAa64ed283774272327533c77e277d469c3b5a9575e02dbc96f8fef56bdc932eb2不变，未构建归档、安装或发布。


### 探头v4双爪部分通过：前倾与微歪头必须一起可读

用户53460先回复「双爪可以，探头表现还要调整」，随后明确「问题是没有往前倾的观感」「好奇探头应该是往前倾、微微歪脑袋」。批准仅限v4双爪形态与原位支撑，表演未过；不将前版技术READY或双爪认可当作整条动作批准，正式目录保持24条。

v5的单一重点为上身前倾＋轻微歪头形成的好奇“凑近看看”。头颈应相对原位双掌前探，肩胸随之压前；用略带侧前方的可读轮廓和自然透视体现靠近，不能以正面低头、只眼动、原位歪头、整图/整头放缩替代真实前倾。两爪继续原位落地，不移、不抬、不打开；白臂灰掌、原短圆趾与小甲不重新设计。整体动作连贯，不机械分解关节，也不将本次问题误归为只需提速或缩短停留。

继续两路实际A/B源门与完整107早期爪稳定/前倾意图/裁边检查；前倾不成立就源HOLD，不先做全套alpha。通过后才紫底蒙版和边缘/必要内区恢复，再原速用户门。不复测无改动的运行时代码，不重开已批准伸懒腰，不安装或发布。


探头v5的前倾＋微歪头候选已完成，尚未用户批准。第一张整图峰值仅歪头且前倾不足，B源输入HOLD并保留；第二张只作上身意图辅助，原idle仍爪体/落点与neutral权威。A原材料观察不改，root方法裁定单独绑定auxiliary-keypose-v5/method-authorization.json；不把意图图新掌组或全姿比例升级为用户许可。fresh Ref2VA source bf9eb4946d413f1335a7123b7c08b8c2a9118bac546999a585c4dbac6097e9d4，两路源实际看图后才alpha。

最终processed-detail-v1 manifest db71b64cb187a387af4534c72492915b4f38b62215ee9665c4b1c00966992e69；A9739fa3148da6248776967be272cd537653300c7bc8d5f76784025f125833baf、B85b1f43be194842c2ceb22afd58d60f0c31990350d6efef1add881acf3be0010、汇总4662cfcd51c44e71de20fa7889b92243e44992246188ddf1b776dfcfc13a602e。完整107技术重放/PNG-WebP/原时序注册/内区守卫通过，本片1811内部误alpha恢复，双爪ROI相对edge逐像素不变。旧被拒初框保留，不放宽守卫。A真实披露细绿黄点/暗紫边/掌底颗粒；B与root所见头鼻相对固定掌组侧前探出，但有明显侧转/抬下巴、约1秒起势和较长峰值hold。不能据技术READY写前倾艺术已通过。

55918原速旧新对照左为v4双爪部分认可/表演HOLD，右为v5，保留原idle旁列与固定双爪放大；固定pad128到896保持全部107原RGBA、24fps及世界尺度。页面冻结证据peek-lean-tilt-final-review-evidence.json SHA272dc8cde6384eda2aac20416b5a026c4eddcfe94cb850d750f36dc428722c3b保存在本地工作区。正式24片catalog哈希a64ed283774272327533c77e277d469c3b5a9575e02dbc96f8fef56bdc932eb2不变；未打包安装发布，等待用户专门判断身体前倾＋微歪头是否读得清楚。


### 探头v5用户通过并接入下一批

用户55918明确「可以，接入并继续下一批」，批准本页右侧peek/key-purple-pilot-v5/processed-detail-v1原速候选，manifest db71b64cb187a387af4534c72492915b4f38b62215ee9665c4b1c00966992e69，review4662cfcd51c44e71de20fa7889b92243e44992246188ddf1b776dfcfc13a602e与页面证据272dc8cde6384eda2aac20416b5a026c4eddcfe94cb850d750f36dc428722c3b精确对应。保留已披露的侧转/抬下巴、峰值hold与细彩边，不再重演；v4只双爪部分认可及v1–v3拒绝历史不改。A冻结user-approval并完成25片集成与两端实际验证，root维护文档与下批评审，B制作下一批。

下一批为ear-flick＋head-shake，两条保持同一原idle固定支撑。抖耳为可读短促耳部反应，眼神/眉与头肩微跟，不能把硬布帽耳演成软片反复扇动或展开折尖；晃脑袋为轻快恢复精神的小幅左右摆与自然收住，肩胸/围巾有连贯附随，不强行演成负面拒绝、不整图机械摇、不慢悠悠站桩。仍原二维/色卡身份、H3原生时序、全107意图/结构/裁边早门、A独立材料/最终、紫底蒙版及用户原速门，未审不入正式资源。


25片源码与隔离stage验证均已通过：catalog revision animated-auxiliary-peek-v5-fa8cc93042dd8f86、SHAa0ad75dd9ed8dc881e4bf478e9278864a26725f2c70d47e54490fb3d2d5c2248；peek-integration-validation.json SHAebed72ff56011b4ae82d8ca7d987276ce2875d116f67dd9f21b79b753133639a记录107HD/54Pi原时间与保留旧24、真实Pi1.3/DSH控制器手动及自动完整4458ms/源106、源仓库两端完整suite exit0。root独立build-editions prepare-only --test在新stage运行Pi/DSH两套均exit0，report为dist/releases/auxiliary-25-source-validation/prepared-editions.json；C工作区auxiliary-25-stage-validation.json SHAc32739bffa62b8e77fed8e6528cca0b840724809a714722d7e8c337e5d6d1b43冻结该轮证据。没有生成新的tgz、安装、提交或发布，已归档旧包不代表25片。下一批两源另在source门，不改变本轮批准目录。


### 抖耳与晃脑袋：最终原速待用户门

两条以同原idle注册输入各单次fresh FL2VA，原107帧/24fps/4458ms与640世界/pivot320608不变。每片源全107爪/裁边/主要意图实际B门与独立A材料门后才做紫底alpha与边缘处理；本片独立core恢复眼星误alpha，完整重放/PNG-WebP/时序/保护守卫及掌ROI相对edge不变均通过。两路最终实际看图记录冻结，不以技术READY批准原速表演或循环。

ear-flick final manifest 3f061916612a6f1a82302f43d974d63ea52621001b4998743bf8e7f1f289718a，review e09b4c98b1f60acb197f1bdf48287ff16e4d2832c87e90cbb09ed0ee8efea27d，A e9f34cfc797d6a23939847013c97723297c5e67d7261e296e6b0d223c6485417，B 5df1e8cbed80f7444213ed542f1c98e2681e3bc0b3340dc64ad8ec09a5be6479。

head-shake final manifest 837834bc0997f337a5cc886b75f3e6f4b6e30795b3b1ff178ecfd24cd3f0d1df，review b9309246b3846c4fb1682dbd24e24cb802572da34807360664843659a0d18c77，A d3a1eb8781bc68341b32f74b352c4bee9ffce8c38ab0b34289e95457a56d3919，B 63ad1c49669190104c2d52fbfeb92f5fbf5be91204479971074ebe69b4349278。

实际局限：抖耳极值上部X原生拖糊，披布侧角与围巾外展；晃脑袋两向有近停留、首段约1秒等待。两条均仍有细绿黄/暗紫彩边及底缘颗粒，黑白与放大实际所见已一次披露，不返工掩盖。原速页http://127.0.0.1:60034/可切两片、黑灰白底及无损107帧，左侧原二维idle参照。C工作区ear-head-final-review-evidence.json SHA5d462c220735c954b396905ccd0af3461a0d0a516ad53bad936d8f9e1ea7a67c绑定页面/配置/视频探针与两路报告。尚未用户通过，不进入正式25片；本轮已批准peek的源码接入/两端和stage验证不受影响，未构建大包、安装或发布。


### 抖耳v1否决、晃脑袋独立通过

用户60034对ear-flick v1明确反馈「太刻意了」，该片不接入；技术A/B/alpha通过仅保留为历史，不能维持艺术通过结论。head-shake随后经独立问题获用户「晃脑袋可以，接入」，批准仅限head-shake/key-purple-pilot-v1/processed-detail-v1，manifest837834bc0997f337a5cc886b75f3e6f4b6e30795b3b1ff178ecfd24cd3f0d1df、reviewb9309246b3846c4fb1682dbd24e24cb802572da34807360664843659a0d18c77与60034页面证据5d462c220735c954b396905ccd0af3461a0d0a516ad53bad936d8f9e1ea7a67c一致。原生首段等待、两向停留及细彩边已披露，既已通过不重开。A冻结exact批准并25→26两端源码整合，ear不随head通过。

ear v2重做为自然注意力反应：像近处轻响被注意到，耳根短促小调一次，眼神/眉轻微回应，同一呼吸回到放松；不能专门示范扇帽耳、向外大折/飞机耳、长hold异常耳形或夸张披布/围巾外甩。原双掌、折耳身份和硬布体积/X不动，不加音符/道具，不用CSS/全图形变。原idle FL2VA fresh，源不可读或仍刻意即HOLD，不先花工跑alpha；继续真实A/B、原生时间与用户门。


26片晃脑袋接入与隔离stage验证已完成：revision animated-auxiliary-head-shake-v1-b01f31ea10dc24c4，catalogSHA0858098c3849e3fd6128da885759d136e3b48426e930a59ecc8245f9ee6bbb0a。head-shake-integration-validation.json SHAb9ac932b0abe76c4745053430ce2368b7373302cb4916b647f10a9a5d3375d27记录新107HD/54Pi原时间、旧25HD/QA/metadata与decoded仅顶层revision变化、真实Pi1.3/DSH manual/auto完整4458ms/源106和两端完整suite exit0。首轮纯测试命令误写peek的失败保留，修正为head-shake后重跑通过，没有runtime修改。38项canonical批准来源独立可校验，ear-flick明确不在正式目录。root独立build-editions prepare-only --test的Pi/DSH两套亦exit0，report为dist/releases/auxiliary-26-source-validation/prepared-editions.json，C工作区auxiliary-26-stage-validation.json SHA8ae080d4ed0badb4b5b21d920d81fea5f17c7d8d13bd9cc5d621fa0f64cca356绑定日志。尚未归档新tgz、安装或发布；ear重做另走原速门。


### 抖耳v2自然小反应：旧新原速待评审

v1用户否决「太刻意了」保持，v2重新生成为立耳向内、更竖的小调整，收住原外扇及布巾外甩。两路实际源和完整107爪/裁边早门后才alpha；本片315内部误alpha恢复，完整107原生重放、PNG/WebP、注册/时序/保护与双掌ROI不变通过。最终manifest d4a00d6fdce44d46cac334586c8549a6f635d404e342469d73f02d099441bcdf，聚合review abe219f12b769a8f8da9f59821060295add4686260f868d6fb2f46473708f3e2；A 8a57173f705b78cb56daa072bb84800c07ba03c3e8ebc11a0143cc45d3831ccf、B 59087cfd8dba1e7a5026e3cfb2335841ef736e34e37c435eb6d9ca636a6214bf冻结。READY仅为可送原速门，不是用户自然性通过。

实际耳峰值及后段仍有停留、线条略软，底缘细暗紫和低饱和绿灰颗粒按本片所见披露，不凭旧例捏造必有亮黄或宣称全片没有。原速对照http://127.0.0.1:49972/左为被拒v1、右为v2，同640世界/24fps107原帧，黑灰白底与固定帽耳眉眼放大可用。C工作区ear-natural-final-review-evidence.json SHA07de2f0a4c2dab26ec72882cc01960605fd7399c8f596e76590f4b767d0748fb绑定页面、配置、视频元数据、最新A/B及26stage证据。正式26不改，晃脑袋批准和接入保持；ear未审不接入，无新大包、安装或发布。


### 抖耳v2用户通过：最后两项先审原生表演源

用户49972明确「可以，接入并继续下一批」，批准ear-flick/key-purple-pilot-v2/processed-detail-v1，manifestd4a00d6fdce44d46cac334586c8549a6f635d404e342469d73f02d099441bcdf、reviewabe219f12b769a8f8da9f59821060295add4686260f868d6fb2f46473708f3e2与C页证据07de2f0a4c2dab26ec72882cc01960605fd7399c8f596e76590f4b767d0748fb对应。旧v1否决保持；v2已披露的耳姿hold和细暗/绿灰边粒不重开。A精确冻结批准并26→27集成，两端实际与canonical来源验证；未归档安装发布。

最后两项nuzzle＋bounce先短核原手势语义：nuzzle为亲昵“蹭一下”，以头颊与肩胸一体侧前轻靠、短柔颊侧蹭弧和满足回正表达；不能退化成探看或左右摇头。bounce原名“开心晃晃/Happy bounce”，坐姿小幅压实承重、头身胸肩整体轻快上弹、落稳与衣料余动，不必大离地，不补新脚、不只爪动或整图缩放。原idle FL2VA试源，原世界尺度、折耳/色卡/紧凑兽爪和最大极值裁边先查；确有需要才whole-image峰值，不局部艺术拼修。

为节省反复alpha处理的LLM额度，本批先内部A源材料与B完整107意图/解剖/支撑/裁边早门；明显不成立直接HOLD重生。合用候选先向用户交原生紫底原速源片，分别确认“蹭感”和“弹起落稳”的整体表演；源艺术获批后才做冻结紫底alpha/边缘、必要独立core和最终透明两路/用户门。原片字节/时序不改，不提前给背景或边缘合格结论。未源批准不跑alpha，未最终通过不进入正式目录。


27片抖耳接入与隔离stage验证已完成：revision animated-auxiliary-ear-flick-v2-566b327f9a029cc3，catalogSHA5e782e1ae3da0a3e23e6b123a4d6e33d3b6ca31700e9f6fbfef2582c7c205aa1。ear-flick-integration-validation.json SHAdff82e5a4f42d6e43ad31fc44111c3fadb599aae3f42fc6479a5ac8324b2cfb0绑定原107HD/54Pi、旧26保真、真实Pi/DSH手动及自动完整4458ms/源106与两套fullsuite exit0。root独立build-editions prepare-only --test的Pi/DSH两套亦exit0，C工作区auxiliary-27-stage-validation.json SHA6d6b7c2e8b220355ca209811bdb3bbcc80459108237e6a1c3f662ee3201ab3a7与dist/releases/auxiliary-27-source-validation/prepared-editions.json冻结本轮记录。nuzzle/bounce仍不在正式目录，未源用户批准不alpha；没有新tgz、安装或发布。


### 用户暂停检查点（2026-10-23T23:25:28.936664+08:00）

用户明确要求“先暂停并保存工作进度”；root已中断B，A已完成，无后续制作、取片、alpha、构建、安装或发布。正式源码保持27条，catalog SHA 5e782e1ae3da0a3e23e6b123a4d6e33d3b6ca31700e9f6fbfef2582c7c205aa1，Pi/DSH及独立prepare-only stage已通过；已发布/本地安装仍preview.1的19条。

nuzzle v1源A/B通过，待用户紫底原速源表演门，未alpha。bounce v3材料A通过但B因约1.83–3.17秒抬姿近停HOLD，不改记艺术通过。唯一fresh bounce v4已提交H3 task `455540689711421`；暂停后未再查询，远端可能自行完成。恢复时先取回现有任务，禁止直接重提。完整检查点为 `work/motion-polish-20261023/PAUSED-PROGRESS-20261023.json`，C工作区同名JSON另存。

进程审计确认26个旧评审服务器、11个托管runner、74个CUA/REPL相关进程；本次未发现所筛Codex相关进程父PID缺失/复用。用户已批准清25旧服务保留49972，但第一轮精确身份保护全部跳过，修正日期比较后的重试因最新暂停指令被自动审批阻止；没有目标进程被终止。不得绕过暂停继续清理；恢复后也应重新核对进程身份，不能直接复用旧PID列表。


### 2026-10-24 用户明确恢复

已按“继续”恢复，两路6.1 Sol high分别负责材料与空间表演；旧agent已不存活，重新建立motion_material_a/motion_source_b。先取既有bounce v4任务455540689711421，不重复提交。nuzzle v1冻结待紫源用户门，v3悬停HOLD不撤回；未批准源表演不alpha。正式27片保持。暂停期间旧85进程身份已全不在，旧49972也已停止；新鲜快照只有1个command-runner/7个CUA相关进程，无旧Node/Python监听服务，不复用旧PID或执行清理。恢复检查点见work/motion-polish-20261023/RESUMED-PROGRESS-20261024.json。


### 2026-10-24 恢复后源表演门

bounce v4旧任务455540689711421已取回，源SHAedf968458ebc7b6be03a7dbe75889afb9d0c6d23e0079c6341aaf0c50fa1b4cb。fresh A报告7e77f1a6a55d0f89109ff7c5b085dd0c6e5366646914d3f39f6ad55d441e1c19记录暗面轻灰绿；B报告f3c471f4581d41ee377c5ee943f58749dc819bf60d6e12ae646bfca5c0f32e3a实际全107及峰值/落地后HOLD，约2.25–3.0s仍近抬姿缓降、075–080披布翼展。未alpha，不交用户当合格候选。两版相近失败后改变方法：v5移除airborne中间峰值，用原idle同首尾FL2VA，改掌贴地承重的开心坐姿小弹；不是继续空中跳跃。

nuzzle v1既有双路源审冻结，独立原紫底原速评审页http://127.0.0.1:56083/#nuzzle，已校验原MP4字节、首末无损PNG和页面JS；C证据nuzzle-source-final-review-20261024-evidence.json SHA9c04b7e3f32a60ce24bee6762b6f87631cd5f54dffdcbcf268da43a3c036f9ba。0.75–2.75s闭眼侧靠停留和围巾外扬已披露，仅等待用户源表演批准，不提前alpha或接入。正式27保持，当前仅启动这一评审服务；旧评审服务已退出，无强杀。


### 蹭蹭v1用户否决：不是歪头休息

用户56083先答“蹭蹭表演还需要调整”，明确“更像歪头休息，没有蹭的感觉”。v1禁止alpha/接入，旧A/B技术资格仅历史、不冒充艺术批准。原片及页面证据不改，否决记录user-source-review-20261024.json。v2改主动向观看者侧前轻凑，头颊/颈肩胸整体短柔接近、轻顶与擦弧，眯眼小笑再回正；双掌支撑、原脸宽及世界尺度，不靠长闭眼侧歪hold表达。B与bounce v5并行fresh原片，A继续材料门；两条未用户源通过仍不alpha。


评审页面进程生命周期（用户明确要求，2026-10-24）：评审完成后立即关闭该页面服务器，不保留历史评审服务常驻。仅root启动当前必要的评审页，登记端口、PID、启动时间、命令行/配置身份和证据文件；用户对该轮给出通过、退回或明确结束后，复核身份再停服务，确认端口释放及专属托管进程结束。需重看时重新启动，不删除素材/评审证据。子代理不得自行启动重复页面服务器；查询、解码、测试等临时helper完成即退出。新评审使用单个服务承载本轮多个动作，不累计旧端口；不得按旧PID直接强杀、不得影响Codex主进程/DSH/其它项目或活跃生成任务。


### 轻弹v5源用户通过；蹭蹭v2内部HOLD

用户61015原速门明确“小弹表演可以，继续透明处理”。批准仅source fda9a64fb785bed16280ebd59df435bdd5ca275540b8b32f7054a15f429a37d6，页证据a55c7bc7480b1367ea818a2a37309a9e001c1c2780cc5d83b28a53b2a954a130，已披露1.58s起势/表情克制/短披布侧展。评审服务会话40912已立即退出，61015端口释放已验证。现许可原动作不变的技术alpha/边缘修复，完整896world不先裁640；最终透明A/B与用户门后方可接入。

nuzzle v2源d00ceb5e6d2bc0e8e9c7edbc11e2ef63e9db0e7733f3573080732e9f4ec8c79f实际双路检查后HOLD：040–078闭眼侧脸停留没有清楚贴擦，近右帽沿有黑紫尖线，禁止alpha。外发先因审批认为授权缺失被拒，root核对会话用户直接H3指示与same reference/prompt/endpoint后同一调用获准，成功task455558411997585；记录保留而非绕过。连续v1/v2蹭语义失败后改查真实接触参考，不继续同提示重试。Cats Protection https://www.cats.org.uk/cats-blog/why-does-my-cat-rub-against-me 有面颊接触/贴擦示例；仅借动作关系，不改变Umi狼角色身份。下一试点改额头轻顶镜头前屏幕平面后顺势颊擦，避免无支点空转脸。


### 轻弹v5最终透明门（2026-10-24）

紫底蒙版/边缘恢复后完整107技术复算与实际A/B完成。最终processed-detail-v1 manifest ce50e9baecec18d7ab2b03973044c33080653305b0173231c38951ab82cc0e4c，A bc6e5628a7e7da699e07598c0669e0b1802f9896ab5c712ba7f0268bb6203ede，B42216ca2b77d44f3853969da2fb3c80d2077b312d7ed926f08d576a1f9db3733；汇总review083705b1e00d59550e83ac7c9197336093df9813580a823a0b4ebb88000d0077。3970眼内误alpha恢复，11个非core标记是真袖侧背景缝保留，RGB/掌区/外8/可靠252/眼框边界与框外逐像素受保护，107PNG/WebP解码/原时序/896world/pivot448736一致。

最终透明页http://127.0.0.1:62731/#bounce，仅本页待评审；C证据bounce-v5-transparent-final-review-20261024-evidence.json SHA5e7e24389577cb9fe41b377a7e4401b88ed2d3322789e5cd2b1dc41884a81370。页/黑白MP4/参考/无损PNG HTTP与JS已验；掌毛底缘细暗紫/灰绿暗粒、帽沿暗紫及袖隙细彩边真实披露。用户给结果后立即关session44909并确认端口释放，不留历史服务。未最终批准不接入；正式27不变。

nuzzle v3已取既有task455559701311932，源e586d32df15223c95dd0a7a9e4b3afb848ccd6ac4c4d512eb9696d36a1b0702f。第027帧native左margin2<4，原守卫失败保留；A报告6b7fa15c6c840d1bd57f9b11689cc0d6b90f1b5f626aa0a711b1b74936075049实看材料/侧披布横铺/闭眼脸颊摊宽，root同见动作仍不够擦颊。HOLD，不padding/裁补/alpha，不继续同式v4。下一轮需先收敛能读出接触的构图试点，再交用户设计评审；不消耗重复失败源的alpha校对额度。


用户62731最终透明门明确“透明细节可以，接入两端”，仅批准bouncev5/processed-detail-v1，manifest ce50e9baecec18d7ab2b03973044c33080653305b0173231c38951ab82cc0e4c、页面证据5e7e24389577cb9fe41b377a7e4401b88ed2d3322789e5cd2b1dc41884a81370。上述细边限制已披露并按本次批准保留，不重开。session44909立即关闭，62731端口释放已验证。user-final-review-20261024.json冻结精确批准；准许27→28两端源码整合与验证，不由本次评审推定安装发布。nuzzle仍HOLD。


### 蹭脸接触姿势整张试点

用户明确选择“朝屏幕凑近，像轻轻蹭你的脸”，root采用内置imagegen以原idle为唯一identity/材料/首尾权威整张重生中段意图，非局部改画。项目Hi-Res/sources/h3-motion-polish-20261023/nuzzle-contact-keypose-v1保存pose.png SHA8366b5298521a6aa77348bd680578cc4813721611c34b9bf9687356cc02386c1、reference.png、完整prompt.txt及provenance。fresh A a17c493b2783d06ff94298218f01110efbd800bf90fc40b8090d1ee988c0fa45、B d1f0a95604280984f11163de739a158c333a8bc8a0035a796ebeaff7a797d0b8实际看图后仅准送用户构图门；头部前近透视显著、竖幅未原世界注册，不能变更原头掌比例/落点authority，也不能据单帧称擦弧通过。直接对话展示，不开评审server；未经用户构图批准不扩展H3。


用户退回nuzzle-contact-keypose-v1：“爪子不对”，具体说明“图片模型看不到藏在后面的大拇指，容易画成三指”。该稿不用于H3，A/B可送用户设计门不等于用户爪形通过。下一整张试点增加原设定paw-anatomy结构输入（仅解剖/遮挡角色），原idle仍唯一身份/材料/首尾；内侧后趾掌根厚度/短趾团/合理遮挡需可读，不强迫四根向前摊开的人指、不补长甲。不局部修爪，失败历史保存。


28片开心小弹接入与独立stage验证已完成：revision animated-auxiliary-bounce-v5-f89cf872d44db9dc，catalog SHA 535c5ee44d10ac7ab13bcd56310c8e71b3b1ed7fcf6db707a63186ab19805130。bounce-integration-validation.json SHA 06649cd6d91f690ee3f4b5afed575f6333600eefefedae684fae35c30e4ea1d9绑定107HD/54Pi完整896→336、旧27 HD/QA/metadata/decoded保真、真实Pi1.3/DSH manual/auto完整4458ms/source106及两套fullsuite exit0。root独立Pi/DSH prepare-only --test亦exit0，auxiliary-28-stage-validation.json SHA 00b3a1009c62722d1a88c877daee10bb2ae00eb40ba31127671b1183de466bf4与dist/releases/auxiliary-28-source-validation/prepared-editions.json冻结来源。没有生成大包、安装或发布，当前源码候选仍preview.2，已安装/发布仍preview.1。nuzzle尚未用户批准，不在catalog；评审server均已在用户给结果后关闭。


最新爪部用户纠正（2026-10-24）：用户退回nuzzle掌部study v1“没那么小。看设定图的样子”。“藏在后面的大拇指”指遮挡关系，不是允许把第四趾缩成小趾根/腕部小狼爪。必须实际回看完整原设定图及paw-anatomy，守住第四趾原有宽厚体量与掌体附着，不强迫四根朝前的人指、不长甲。study v1仅内部可送用户门已被用户推翻，不得当权威或H3输入。


原设定复查后整张新生掌部结构study v2：nuzzle-paw-structure-pilot-v2/study.png SHA9e93974e941bc8d34175e07f8ce946a4b7b4a7029f52067692dcf7b2bef8c131，原完整设定/原掌示意为解剖输入，原idle为画风/首尾及支撑职责。第四趾体量改为较完整宽厚、掌侧连接，不能再解释为小腕趾。只作结构门，甲大小/白臂长度/颜色/全身比例不由study升级；不拼回成品，用户未通过不生成pose/H3。无新评审服务器。


掌部study v2 fresh A e03c34abd71292077e2eb9a7b5130e339afe866e28a6bc3fbb024453645b0d55、B cad085b3485dcf24e5a5302c8dec282e159b748725be4fc4b3d7cbbe314ecc75均实际对照完整原设定后仅准送用户结构门。第四侧趾有完整体量并连掌侧、非腕上小附趾；甲仍较显，仅结构角色，不升级甲/比例/颜色。已直接对话向用户发结构v2问题，未开服务器。CURRENT-PROGRESS-20261024.json保存28条完整整合/独立stage已过与当前待审点；未经结构批准不whole-pose/H3。


最新用户狼爪规则（2026-10-24，覆盖此前拇趾推断）：用户明确“不用那么纠结，用这个画风画一个狼爪子就行了”，并说明“四指是狼爪那种中长长中的稍微对称的关系”。四枚短圆狼趾沿掌缘自然排列，外侧两枚中等、中央两枚稍长，整体略对称，厚掌收拢，短甲露尖。撤回代理此前“三个主要前趾+单独后侧拇趾/腕上狼爪”的解释，不能将其写成用户设定；此前study只留失败历史，不作解剖authority。用原设定和已认可画风画自然狼爪，不再扩展结构图、强行分拆成手指或长甲。


用户进一步要求自然狼爪“四指中长长中、稍微对称”，撤回三前趾+后拇趾理论并停止study扩展。内置imagegen keypose v3/v4/v5仍有三趾读感（v4多露尾巴），整张失败图与完整prompt各自保存，均不H3。停止同模型重复whole试错；A仅查用户早前提供Seedream5Pro本机已有harness/模型/载荷，不外发，换流程前核对可审方案。四趾关系仍需自然厚掌与短甲，不用人工补指/局部贴图。当前无评审server，28source/stage通过保持。


Seedream替代整张流程准备完成（未生成/未外发）：已找到本机byted-ark-seedream-skill/scripts/generate.js及model-routing.js，model doubao-seedream-5.0-pro /1.5K，AgentPlan plan/v3/images/generations，本地prepareParams/buildRequestBody验证整张prompt与原idle/完整原设定/原掌图三参照。摘要seedream-nuzzle-pilot-request-summary.json，payload SHAa7a63ae9f0ec7b54d287161d9f376e0dfa369dc98522988b5e16263367b5e51f，仅C工作区含dataURI请求未提交。当前Process/User/Machine没有harness认可的Bearer或ARK变量，仅有VOLC_ACCESSKEY/VOLC_SECRETKEY名称，未将其借作Bearer。已向用户询问现有Key变量名或配置路径，不要求聊天中发送密钥。待凭据位置明确再单次fresh全图；无任何评审服务器运行，28源码与stage已通过保持，未安装发布。


2026-10-24 用户询问“为什么要调用Seedream?”。root说明该切换只是为反复三趾生图提出的可选模型试验，并非项目依赖；在用户要求自然狼爪后继续扩展换模型/找凭据是不必要的复杂化，root撤回凭据请求及本次切换计划。此为代理自我纠偏，不记为用户禁用某平台。Seedream未上传参考图、未发生成请求，networkRequests=0。接续不再等待AgentPlan Key，回到既有已认可画风与H3流程，保留四狼趾“中长长中”及用户评审门，避免重复无方向试错；28条已过两端/stage结果不变，当前无评审server。


## 2026-10-24 subscription whole-pose retry v6

User requested another attempt with included subscription generation. Used built-in image_gen, no API key or Seedream call; exact model is not exposed and is not attributed as GPT Image 2.5. Original idle and recovered full original design were the only image inputs. Saved whole transparent candidate, prompt, provenance and fresh A/B actual visual reviews in Hi-Res/sources/h3-motion-polish-20261023/nuzzle-contact-keypose-v6-subscription. Warm forward/side close-lean intent improved, but three rounded toe masses remain the dominant read; internal HOLD, not human rejection or approval. No H3 expansion, catalog changes, server, install or release. Formal validated source remains 28 clips.


## 2026-10-24 user authorizes nuzzle v4 source trial

User explicitly asks to stop focusing on paws, use original idle for first/last and subscription v6 as middle acting reference, and generate a nuzzle video. This overrides the v6 static-paw HOLD only for this single source trial. No static paw reinterpretation, formal asset approval or alpha-before-acting authorization implied. Fresh A/B actual source review and native-speed user acting gate retained.


## 2026-10-24 nuzzle v4 rejected; prompting workflow corrected

User rejectedv4 as still not a nuzzle, then requested official H3 prompting research and less precise action prompts. Source remains unchanged/rejected, no alpha. session62990 exited and port62004 released. Read official MiniMax-AI H3 skill, Ref2VA and keyframe guides through native web; Context7 resolver was quota-exhausted. Official sources support clear mode/reference roles and concrete observable action, not a blanket shortest-prompt claim. Next source reuses the same two authorized images with intent-led compact action and essential setup only; remove old long FOOT, numeric body registration and joint choreography from submitted text. Full research distinctions saved beside checkpoint.


## 2026-10-24 nuzzlev5 acting approved; natural squint refinement

User at56154 explicitly approvedv5 “这个就对了”, then asked “加上一个蹭的时候眯眼睛更好”. Approved source b221597215514cecf8eb35a85a54016fd01b144b2c4014f9ed386598552a14f0 is frozen as acting baseline; internal earlier static long-hold observations do not override this user acting decision. One freshv6 uses byte-identical two refs and compact prompt, changing only a natural squint phrase, without old FOOT/joint details. Regeneration is not a promise of identical motion: compare and user-review before replacement or alpha. session16460 exited/56154 released immediately after review. Formal28 unchanged.


H3首尾帧API核验（2026-10-24，用户纠正）：官方V2支持content中两张image_url分别role=first_frame与last_frame。需要首尾控制时必须实际使用该模式，不得用reference_image加文字首尾要求冒充。官方明确首尾帧与任意reference_*角色互斥，没有middle_frame角色。循环可用同一原待机作真实首尾；若还必须硬约束独立中图，需要有意识地分两段生成，不能静默丢弃中图或伪造混合参数。实际源首尾/尺度/接缝仍应验收，不承诺编码像素完全一致。官方链接和无私有图片载荷示例保存在work/motion-polish-20261023/h3-first-last-api-audit-20261024.json及nuzzle-first-last-request-example.json。

2026-10-24 v7实际首尾FL2VA已解决回正，但中段折耳/披布原生裁边minmargin0，A/B保持HOLD，不alpha。临时65152/session17816在内部发现后关闭，未作为合格源向用户打开。v8仅更改原idle输入固定画布为896（原640内RGB/RGBA逐像素原样，offset128），prompt与v7字节相同，真实first/last，task455589921534267单次提交；不是对已裁原片后补边。用户认可v5冻结。


工具间连续播放约束（用户2026-10-24明确）：最后工具完成但下一步未到时，真实phase/toolCount立即更新，显示用pendingNextState安全阶段元数据保留原动作最多2000ms。连续读取／编辑及相同clip映射的调用沿原播放时钟接续，不重播首帧、不重复键盘出入；非空真实思考或回答、新工具、等待／压缩／终态和会话切换接管。step/start、message_start、正常message_end、text/thinking块开始结束与空delta不作为新内容，不取消或续期。超时仍busy则释放回thinking，不伪造idle。业务截止使用墙钟，暂停／隐藏不得冻结截止，不新增计时器；最短可见时长与加载上限独立保留。两端实际宿主回归和同clip playbackMs连续性均须验证。


颜色验收尺度（用户2026-10-24最新）：已看五组15代表帧后明确“继续，颜色只要做到不容易一眼看出来即可”。允许同向克制校偏扩展完整循环与现用29动作（含待机基准），以正常桌宠尺寸、原速播放及动作切换不显著跳色为准；保留自然阴影，不追逐像素精确、恒定亮度或色卡平涂。原alpha/轮廓/锚点/时序/道具保持，HD与Pi从同一候选派生。先完整候选两路实际复核+用户观看正常尺寸切换，再覆盖/安装；已通过的造型不重开、不为轻微可接受色差反复返工。
开场与戳一戳（同日用户新任务）：优先复用已批准连续H3动作，开场自然连贯，戳动按情境有区别并避免连续同一回应；保持真实会话状态、输入与单计时器，不回到简单静图扭曲重复。


颜色v1用户终审（2026-10-24）：整套29候选被退回“仍有明显跳色，需要调整”，用户锁定“喜欢affection”。此前A/B技术守恒与静帧通过不等于切换颜色通过；不安装v1。下一轮只针对喜欢与已认可待机核对，重点分离帽/披布、围巾与毛色的色相、饱和、明暗差，不能继续把luma不变当作颜色修好。保持自然阴影、原动作/三心/单层下摆/alpha/锚点/时序，不盲目逐帧或全图均值匹配。先小试点真实原速切换，两路实际复核与用户门保留。原29其他颜色候选未获得整体通过，不擅自推定28条已通过。
同轮用户已明确“可以，采用这套互动”，批准挥爪开场和闲时bounce/ear-flick、忙碌或等待head-shake/ear-flick的不连续重复方案。代码与两端测试已通过，保留待统一构建安装，不因颜色退回重做互动。评审56130已核验身份关闭并释放端口。


用户最终批准混合配色与互动（2026-10-24）：在62191原速idle→喜欢→idle评审后，明确“可以，按这套整合”。批准集合为上轮v1其余28条不变＋喜欢A02（v1输入上固定围巾提亮减饱和、衣料轻微校偏），不是退回v1喜欢又恢复。work/color-consistency-affection-20261024-v2/user-final-approval.json绑定精确输入与两路报告。允许统一接入Pi/DSH、构建并本地安装；开场/戳一戳同轮已通过无需重审。新增颜色导数来源，不重写旧动作批准，不改alpha/锚点/时序/已认可造型；Pi沿原采样和同套共同palette。正式版本目标2.5.1-preview.6，当前安装仍preview.5直到安装报告确认。没有新发布请求。62191服务已核验关闭且端口释放。
