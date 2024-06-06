import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  // 依赖sources生成
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dev.linglong.extension.gen_deb_source",
      gen_deb_source
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dev.linglong.extension.build",
      builderBuild
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("dev.linglong.extension.run", builderRun)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dev.linglong.extension.export",
      builderExport
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dev.linglong.extension.build.offline",
      builderOfflineBuild
    )
  );
}

async function gen_deb_source() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const document = editor.document;
  const selection = editor.selection;
  // 构建临时文件的路径
  const tempDir = os.tmpdir();
  const text = document.getText();

  let endline = document.lineCount;
  let depends = [] as string[];
  let scriptFile = "";
  for (let [index, line] of text.split("\n").entries()) {
    line = line.trimStart();
    // 获取依赖
    if (line.startsWith("# linglong:gen_deb_source install")) {
      endline = index;
      depends.push(line.slice("# linglong:gen_deb_source install".length));
    }
    // 获取源
    else if (line.startsWith("# linglong:gen_deb_source sources")) {
      const sources = line
        .slice("# linglong:gen_deb_source sources".length)
        .trim();
      const [arch, url, distribution, ...components] = sources.split(" ");
      const tempFilePath = path.join(tempDir, "get_deb_source.sh");
      const content = `#!/bin/bash
            set -e
            set -x
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
  if (!depends) {
    return;
  }
  let dependFile = "";
  dependFile = path.join(tempDir, "depends.list");
  await fs.writeFile(dependFile, depends.join(","));

  // 删除选中行到文件尾部的内容
  const start = document.lineAt(endline + 1).range.start;
  const end = document.lineAt(document.lineCount - 1).range.end;
  const range = new vscode.Range(start, end);
  await editor.edit((editBuilder) => {
    editBuilder.delete(range);
  });
  document.save();

  const installdepUrl =
    "https://gitee.com/deepin-community/linglong-pica/raw/master/misc/libexec/linglong/builder/helper/install_dep";
  const terminal = vscode.window.createTerminal(`Ext Terminal`);
  terminal.sendText(`wget -N ${installdepUrl}\n`);
  terminal.sendText(
    `cat ${dependFile} | bash ${scriptFile} >> ${document.fileName}\n`
  );
  terminal.sendText("bash -c 'rm linglong/sources/*.deb'");
  terminal.show();
}

async function builderOfflineBuild() {
  const terminal = vscode.window.createTerminal(`Ext Terminal`);
  terminal.sendText(`ll-builder build --offline`);
  terminal.show();
}

async function builderBuild() {
  const terminal = vscode.window.createTerminal(`Ext Terminal`);
  terminal.sendText(`ll-builder build`);
  terminal.show();
}

async function builderRun() {
  const terminal = vscode.window.createTerminal(`Ext Terminal`);
  terminal.sendText(`ll-builder run`);
  terminal.show();
}

async function builderExport() {
  const terminal = vscode.window.createTerminal(`Ext Terminal`);
  terminal.sendText(`ll-builder export`);
  terminal.show();
}
