import re
import json
from zhon import hanzi

delim = '[' + hanzi.stops + '，' + '\n' + ']'

def lcs(a:str,  b:str):
	dp = [[0] * (len(b)+1) for _ in range(len(a)+1)]
	for i in range(len(a)+1): dp[i][0] = 0
	for j in range(len(b)+1): dp[0][j] = 0
	for i in range(1, len(a)+1):
		for j in range(1, len(b)+1):
			if a[i-1] == b[j-1]:
				dp[i][j] = dp[i-1][j-1]+1
			else:
				dp[i][j] = max(dp[i-1][j], dp[i][j-1])
	return dp[len(a)][len(b)]

# 開檔
jsonFile = open('output.json')
datas = json.load(jsonFile)

datas_len = len(datas['pages'])
if datas_len <= 1:
	print('目前僅有', datas_len, '筆資料，無法比對。', end='')
	exit()

# 最後一筆資料與前面其他資料逐一比對
fragmentA = datas['pages'][datas_len-1]['content']
# 將內文拆分成一句一句
sentencesA = list(filter(None, re.split(delim, fragmentA)))

compRes = []

for page in datas['pages'][:-1]:

	fragmentB = page['content']
	sentencesB = list(filter(None, re.split(delim, fragmentB)))

	MIN_LEN = 10

	high = 0
	hA = ""
	hB = ""
	for sA in sentencesA:
		if len(sA) < MIN_LEN: continue
		for sB in sentencesB:
			if len(sB) < MIN_LEN: continue
			if max(len(sA), len(sB)) / min(len(sA), len(sB)) > 1.7: continue
			rat = lcs(sA, sB) / max(len(sA), len(sB))
			if rat > 0.8: compRes.append([rat, sA, sB])

# compRes.sort()
if not compRes:
	print('在歷史文件中沒有找到相似的句子。', end='')
else:
	for (idx, res) in enumerate(compRes):
		if idx > 0: print('------')
		print('歷史文件：', res[2], '\n本文：', res[1], '\n相似度', res[0], '。', sep='', end='')
		if idx < len(compRes)-1: print()
