"""Generate clearly fictional Chinese reading fixtures. Requires reportlab + Poppler."""
from pathlib import Path
import os, subprocess
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
root=Path(__file__).resolve().parent.parent
out=root/'tests/fixtures/demo-ai';out.mkdir(parents=True,exist_ok=True)
font=os.environ.get('DEMO_CJK_FONT','/System/Library/Fonts/STHeiti Light.ttc')
pdfmetrics.registerFont(TTFont('CJK',font,subfontIndex=0))
style=ParagraphStyle('text',fontName='CJK',fontSize=15,leading=24,textColor=HexColor('#586B7B'),wordWrap='CJK')
pages=[('从资料中找答案，让出处清晰可查。','产品概览', [('集中检索','将分散文档整理为可检索资料，按自然语言问题寻找相关内容。'),('查看来源','答案草稿关联资料名称与来源片段，便于回到原文核对。'),('人工确认','答案用于辅助整理。涉及重要决定时，由使用者确认来源及适用条件。')]),('提问、查阅、核对，保留判断依据。','典型使用流程',[('01 提出问题','新人查阅制度说明，业务人员整理答复依据，维护人员核对更新内容。'),('02 阅读草稿与出处','查看整理后的要点，并对照资料中的原始描述及当前版本。'),('03 复核后使用','确认信息没有遗漏、断章取义或版本混用，再用于后续工作。')]),('能力有边界，重要信息回到原文。','输入与输出',[('输入','已整理的示例文档与问题。本演示不接收真实敏感资料。'),('输出','答案草稿、来源片段和资料名称。答案不代替原文。'),('适用限制','可能存在遗漏或理解偏差。本产品为虚构展示样例，不表示资料库已提供 AI 问答服务。')])]
pdf=out/'资料问答助手_Demo.pdf'
c=canvas.Canvas(str(pdf),pagesize=(960,720),invariant=1);c.setTitle('资料问答助手 - Demo 虚构展示样例');c.setAuthor('中技安全产品资料库本地演示')
for i,(headline,section,items) in enumerate(pages,1):
 c.setFillColor(HexColor('#F5F7F9'));c.rect(0,0,960,720,fill=1,stroke=0)
 c.setFillColor(HexColor('#112D42'));c.rect(0,648,960,72,fill=1,stroke=0)
 c.setFont('CJK',19);c.setFillColor(HexColor('#FFFFFF'));c.drawString(48,675,'资料问答助手')
 c.setFont('CJK',12);c.drawRightString(912,677,'Demo · 虚构展示样例')
 c.setFillColor(HexColor('#087F82'));c.setFont('CJK',14);c.drawString(48,606,section)
 c.setFillColor(HexColor('#173046'));c.setFont('CJK',30);c.drawString(48,552,headline)
 for j,(title,body) in enumerate(items):
  y=424-j*115;c.setFillColor(HexColor('#FFFFFF'));c.roundRect(48,y,864,94,10,fill=1,stroke=0)
  c.setFont('CJK',18);c.setFillColor(HexColor('#173046'));c.drawString(70,y+62,title)
  p=Paragraph(body,style);w,h=p.wrap(800,70);p.drawOn(c,70,y+48-h)
 c.setFillColor(HexColor('#586B7B'));c.setFont('CJK',12);c.drawString(48,40,'仅供本地阅读与流程验证，无真实产品指标或客户信息。');c.drawRightString(912,40,f'{i} / {len(pages)}');c.showPage()
c.save()
subprocess.run(['pdftoppm','-scale-to','1440','-png',str(pdf),str(out/'page')],check=True)
print('Generated 3 Chinese PDF pages and 3 ordered images.')
