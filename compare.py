import re
from zhon import hanzi

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

fragmentsA = ["FreeBSD 是一個開源的類 Unix 作業系統，它具有穩定性、可靠性和安全性的特點。該系統由一個強大的全球社群開發和維護，並以 BSD 授權釋出，這意味著用戶可以自由地使用、修改和分發 FreeBSD 的原始碼。", "FreeBSD 源於 1970 年代的 UNIX 系統，並且在過去的幾十年間不斷演進和發展。它提供了一個完整的作業系統，包括核心系統、標準工具和各種應用程序。它支援多種硬體架構，包括 x86、ARM、PowerPC 等，使得它適用於各種設備和場景，從個人電腦到伺服器和嵌入式系統。", "FreeBSD 具有出色的性能和穩定性。它的核心設計注重效能和可靠性，並且經過廣泛測試和優化。它在各種負載和環境中都表現出色，可以提供高效的運算能力和快速的回應時間。", """
安全性是 FreeBSD 的另一個關鍵特點。它有一個專門的安全團隊，持續監測和修補系統中的漏洞。FreeBSD 提供了強大的安全特性，如強制存取控制、加密檔案系統和防火牆等，以保護系統免受潛在威脅。

FreeBSD 還擁有一個龐大的軟體庫，其中包含數以千計的自由軟體和開源應用程序。用戶可以輕鬆地通過包管理器安裝和管理這些軟體，以滿足各種需求，如網頁伺服器、資料庫、郵件伺服器等。這使得 FreeBSD 成為一個功能豐富且高度可定製的作業系統。

最後，FreeBSD 社群的力量和支持是這個作業系統的關鍵。全球的開發者和用戶社群共同貢獻和維護 FreeBSD，提供支援和解答問題。社群通過郵件列表、論壇和 IRC 等方式互相交流"""]

fragmentsA = ["""FreeBSD 是一個自由開源的作業系統，它是從 AT&T 的 UNIX 操作系統衍生出來的。它的名字中的 "BSD" 代表 "Berkeley Software Distribution"，這是指該系統最初是在加州大學伯克利分校開發的。

FreeBSD 的目標是提供一個穩定、高效且安全的作業系統，適用於各種不同的平台，包括伺服器、桌面電腦和嵌入式系統。它擁有一個強大的開發社區，這個社區致力於不斷改進 FreeBSD，並提供技術支援和相關資源。

FreeBSD 的特點之一是其穩定性和可靠性。它以其優秀的性能和強大的網絡堆疊聞名，特別適合用於網絡伺服器和高流量環境。FreeBSD 還提供了豐富的軟體庫和工具，以支援各種應用程序和開發需求。

此外，FreeBSD 遵循自由軟體的原則，因此它可以免費使用、修改和散佈。這使得它成為許多人和組織的選擇，特別是那些重視開源和自由的價值觀的人們。

總結來說，FreeBSD 是一個穩定、高效且安全的自由開源作業系統，具有廣泛的應用領域，並擁有強大的開發社區。無論是在伺服器、桌面還是嵌入式系統中，FreeBSD 都是一個值得考慮的選擇。"""]

fragmentsB = [
"""
FreeBSD 是一個開源的作業系統，它基於 BSD（Berkeley Software Distribution）的版本發展而來。BSD 作業系統系列起源於 1970 年代的 UNIX，而 FreeBSD 是其中一個衍生版本。

FreeBSD 具有許多引人注目的特點。首先，它是一個高度穩定且可靠的作業系統。由於開發者對代碼的嚴格審查和測試，FreeBSD 提供了可信賴的運行環境。這使得它成為許多企業和組織選擇的首選，特別是在伺服器和網路設備領域。

其次，FreeBSD 在性能方面表現出色。它的設計優化和內核功能使其具有高效能和優越的處理能力。這使得 FreeBSD 非常適合處理高負載的任務，例如網站伺服器、資料庫系統和大型企業應用。

此外，FreeBSD 也以其安全性聞名。它提供了多層次的安全特性和內建的安全措施，以保護系統免受惡意攻擊和漏洞利用。FreeBSD 的安全團隊致力於監測和修補潛在的安全漏洞，並及時提供安全更新，確保系統的安全性和穩定性。""",
"另一個重要的優勢是 FreeBSD 的彈性和可定製性。由於其開放的原始碼和自由軟體授權，用戶可以自由地修改和定製 FreeBSD，以滿足其特定需求。這使得 FreeBSD 成為開發者和技術愛好者的首選，他們可以根據自己的需求進行自由發揮和創新。", "最後，FreeBSD 社群的活躍和支持也是其成功的重要因素。全球的開發者和用戶社群提供了支援和合作，他們共同貢獻於 FreeBSD 的發展和改進。社群提供了豐富的文件、討論區和線上資源，使用戶能夠輕鬆獲取支援和解決問題。", "總結而言，FreeBSD 是一個強大、穩定和安全的開源作業系統。它在性能、可定製性和安全性方面具"]

delim = '[' + hanzi.stops + '，' + '\n' + ']'

sentencesA = []
for fragment in fragmentsA:
	sentencesA += list(filter(None, re.split(delim, fragment)))

sentencesB = []
for fragment in fragmentsB:
	sentencesB += list(filter(None, re.split(delim, fragment)))

"""
print(sentencesA)
print()
print(sentencesB)
"""

MIN_LEN = 13

high = 0
hA = ""
hB = ""
compRes = []
for sA in sentencesA:
	if len(sA) < MIN_LEN: continue
	for sB in sentencesB:
		if len(sB) < MIN_LEN: continue
		if max(len(sA), len(sB)) / min(len(sA), len(sB)) > 1.7: continue
		rat = lcs(sA, sB) / max(len(sA), len(sB))
		if rat > 0.65: compRes.append([rat, sA, sB])
compRes.sort()
for r in compRes:
	print(r)
