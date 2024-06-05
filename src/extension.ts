import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const keywords = {
  id: "",
  name: "",
  version: "",
  package: "",
  base: "",
  runtime: "",
  sources: "",
  command: "",
  build: "",
  digest: "",
  url: "",
  kind: "",
  description: "",
};

export function activate(context: vscode.ExtensionContext) {
  // 代码提示
  const triggers = [" "];
  const documentSelector: vscode.DocumentSelector = {
    pattern: "**/linglong.yaml",
  };
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    documentSelector,
    {
      async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
      ) {
        const range = new vscode.Range(
          new vscode.Position(position.line, 0),
          position
        );
        const text = document.getText(range);
        const completionItems = Object.keys(keywords)
          .filter((v) => v.startsWith(text))
          .map((item, index) => {
            return {
              label: item + ": 1",
              preselect: index === 0,
              documentation: "玲珑插件",
            };
          });
        return [];
      },
    },
    ...triggers
  );
  context.subscriptions.push(completionProvider);

  // 依赖sources生成
  let disposable = vscode.commands.registerCommand(
    "dev.linglong.extension.gen_deb_source",
    async () => {
      // 获取当前活动的文本编辑器
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const document = editor.document;
        const selection = editor.selection;

        const text = document.getText();

        let endline = document.lineCount;
        let depends = "";
        let scriptFile = "";
        for (let [index, line] of text.split("\n").entries()) {
          line = line.trimStart();
          // 获取依赖
          if (line.startsWith("# linglong:gen_deb_source install")) {
            endline = index;
            if (depends !== "") {
              depends += ",";
            }
            depends += line.slice("# linglong:gen_deb_source install".length);
          }
          // 获取源
          else if (line.startsWith("# linglong:gen_deb_source sources")) {
            const sources = line
              .slice("# linglong:gen_deb_source sources".length)
              .trim();
            const [arch, url, distribution, ...components] = sources.split(" ");
            // 构建临时文件的路径
            const tempDir = os.tmpdir();
            const tempFilePath = path.join(tempDir, "get_deb_source.sh");
            const content = `#!/bin/bash
            set -e
            # 去掉 [*] 和 <*> 便于从 deb 复制 Build-Depends
            pkgs=$(cat /dev/stdin | sed "s#\[[^]]\+]##g" | sed "s# <\w\+># #g" | tr ',' '|')

            url=${url}
            distribution=${distribution}
            components="${components.join(" ")}"
            arch=${arch}

            rm -rf ~/.aptly
            aptly mirror create -ignore-signatures -architectures=$arch -filter="$pkgs" -filter-with-deps linglong-download-depend $url $distribution $components > /dev/null
            aptly mirror update -ignore-signatures linglong-download-depend > download.log

            grep 'Success downloading' download.log|grep 'deb$'|awk '{print $3}'|sort|while IFS= read -r url; do
                filename=$(basename "$url")
                filepath=$(find ~/.aptly/pool|grep "\_$filename")
                digest=$(sha256sum "$filepath"|awk '{print $1}')
                echo "  - kind: file"
                echo "    url: $url"
                echo "    digest: $digest"
            done

            rm download.log`;
            await fs.writeFile(tempFilePath, content);
            scriptFile = tempFilePath;
          }
        }
        if (!scriptFile) {
          return;
        }
        // 删除选中行到文件尾部的内容
        const start = document.lineAt(endline + 1).range.start;
        const end = document.lineAt(document.lineCount - 1).range.end;
        const range = new vscode.Range(start, end);
        await editor.edit((editBuilder) => {
          editBuilder.delete(range);
        });
        document.save();
        // 重新生成内容
        const selectedText = document.getText(selection);
        const terminal = vscode.window.createTerminal(`Ext Terminal`);
        terminal.sendText(
          `echo ${depends} | bash ${scriptFile} >> ${document.fileName}`
        );
        terminal.show();
      }
    }
  );

  context.subscriptions.push(disposable);
}
