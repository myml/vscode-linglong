import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export function activate(context: vscode.ExtensionContext) {
  // dsc source生成
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dev.linglong.extension.gen_dsc_source",
      () => gen_dsc_source(context)
    )
  );
  // deb source生成
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

export async function gen_deb_source() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const document = editor.document;
  // 构建临时文件的路径
  const tempDir = os.tmpdir();
  const text = document.getText();

  let endline = document.lineCount;
  let depends = [] as string[];
  let scriptFile = "";
  for (let [index, line] of text.split("\n").entries()) {
    line = line.trimStart();
    switch (true) {
      case line.startsWith("# linglong:gen_deb_source sources"):
        const sources = line
          .slice("# linglong:gen_deb_source sources".length)
          .trim();
        const [arch, url, distribution, ...components] = sources.split(" ");
        const tempFilePath = path.join(tempDir, "get_deb_source.sh");
        const content = `#!/bin/bash
                set -e
                # 去掉 [*] 和 <*> 便于从 deb 复制 Build-Depends
                pkgs=$(cat /dev/stdin | sed "s#\\[[^]]\\+]##g" | sed "s# <\\w\\+># #g" | tr ',' '|')
    
                url=${url}
                distribution=${distribution}
                components="${components.join(" ")}"
                arch=${arch}
    
          rm -rf ~/.aptly
          aptly mirror create -ignore-signatures -architectures=$arch -filter="$pkgs" -filter-with-deps linglong-download-depend $url $distribution $components > /dev/null
          aptly mirror update -ignore-signatures linglong-download-depend > download.log

          grep 'Success downloading' download.log|grep 'deb$'|awk '{print $3}'|sort|while IFS= read -r url; do
              filename=$(basename "$url")
              filepath=$(find ~/.aptly/pool|grep "\\_$filename")
              digest=$(sha256sum "$filepath"|awk '{print $1}')
              echo "  - kind: file"
              echo "    url: $url"
              echo "    digest: $digest"
          done

          rm download.log`;
        await fs.writeFile(tempFilePath, content);
        scriptFile = tempFilePath;
        break;
      case line.startsWith("# linglong:gen_deb_source install"):
        endline = index;
        depends.push(line.slice("# linglong:gen_deb_source install".length));
        break;
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

export async function gen_dsc_source(context: vscode.ExtensionContext) {
  const tempDir = os.tmpdir();
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  console.log(context.storageUri);
  const document = editor.document;
  const text = document.getText();
  if (!vscode.workspace.workspaceFolders) {
    return;
  }
  const depends: string[] = [];
  let installBegin = 0;
  let installEnd = 0;
  let lastInstallCommand = 0;
  let scriptFile = "";
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trimStart();
    switch (true) {
      case line.startsWith("# linglong:gen_dsc_source sources"):
        const sources = line
          .slice("# linglong:gen_deb_source sources".length)
          .trim();
        const [url, distribution, ...components] = sources.split(" ");
        const content = `#!/bin/bash
          set -e
          
          url=${url}
          distribution=${distribution}
          components="${components}"
          
          tmpdir=$(mktemp -d)
          cd "$tmpdir"
          # 下载Sources文件
          for component in $components;do
              curl -s "$url/dists/$distribution/$component/source/Sources.gz" | gunzip >> Sources
          done;
          
          while IFS= read -r pkg; do
              # 解析Sources文件，获取pkg的存放目录
              path=$(cat Sources | grep -E "^Package:|^Version:|^Directory:" | 
                  awk 'BEGIN { FS = ": " } { if ($1 == "Package") { pkg = $2 } else if ($1 == "Version") { ver = $2 } else if ($1 == "Directory" && pkg=="'$pkg'") { printf "%s/%s_%s.dsc\\n",$2, pkg, ver } }')
              echo "  - kind: dsc"
              echo "    name: $pkg"
              echo "    url: $url/$path"
              echo "    digest: $(curl -s "$url/$path" | sha256sum | awk '{print $1}')"
          done;
          
          rm -r "$tmpdir"`;
        const tempFilePath = path.join(tempDir, "get_dsc_source.sh");
        await fs.writeFile(tempFilePath, content);
        scriptFile = tempFilePath;
        break;
      case line.startsWith("# linglong:gen_dsc_source install"):
        depends.push(
          ...line
            .slice("# linglong:gen_deb_source install".length)
            .split(",")
            .map((pkg) => pkg.trim())
        );
        lastInstallCommand = index;
        break;
      case line.startsWith("# linglong:gen_dsc_source begin"):
        installBegin = index;
        break;
      case line.startsWith("# linglong:gen_dsc_source end"):
        installEnd = index;
        break;
    }
  }
  console.log(lastInstallCommand, installBegin, installEnd);
  if (installBegin > 0 && installEnd > 0) {
    // 删除选中行到文件尾部的内容
    const start = document.lineAt(installBegin + 1).range.start;
    const end = document.lineAt(installEnd - 1).range.end;
    const range = new vscode.Range(start, end);
    await editor.edit((editBuilder) => {
      editBuilder.replace(range, "\n");
    });
  } else {
    installBegin = lastInstallCommand + 1;
    const start = document.lineAt(installBegin).range.start;
    await editor.edit((editBuilder) => {
      editBuilder.insert(
        start,
        "# linglong:gen_dsc_source begin\n  # linglong:gen_dsc_source end\n\n"
      );
    });
  }
  await document.save();
  let dependFile = path.join(tempDir, "dsc.list");
  await fs.writeFile(dependFile, depends.join("\n") + "\n");

  const terminal = vscode.window.createTerminal(`Ext Terminal`);
  terminal.sendText(
    `cat ${dependFile} | bash ${scriptFile} | sed -i '${
      installBegin + 1
    }r/dev/stdin' ${document.fileName}`
  );
  // 避免sed不触发vscode重新加载
  terminal.sendText(`echo "">> linglong.yaml`);
  terminal.show();
}
