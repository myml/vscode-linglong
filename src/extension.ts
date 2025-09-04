import vscode from "vscode";
import fs from "fs/promises";
import os from "os";
import path from "path";
import yaml from "yaml";

// 激活扩展
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
  // deb source转buildext
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dev.linglong.extension.deb_source_to_buildext",
      debsource2buildext
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
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dev.linglong.extension.build.clean",
      buildClean
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

// 生成deb source
export async function gen_deb_source() {
  const config = vscode.workspace.getConfiguration();
  const option = {
    skip: config.get("linglong.gen_deb_source.skip", false),
    denylist: config.get("linglong.gen_deb_source.denylist", Array<string>()),
  };

  console.log("run gen_deb_source");
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  // ll-builder build --skip-pull-depend -- sh -c "cat /packages.list /runtime/packages.list > packages.list"
  const document = editor.document;
  const ext = vscode.extensions.getExtension("myml.vscode-linglong");
  if (ext) {
    const installdepUrl =
      "https://gitee.com/deepin-community/linglong-pica/raw/master/misc/libexec/linglong/builder/helper/install_dep";
    const terminal = vscode.window.createTerminal(`gen deb`);
    terminal.sendText(` wget -O install_dep ${installdepUrl}`);

    const randomDirName = Math.random().toString(36).substring(7);
    const dirpath = path.join(os.tmpdir(), randomDirName);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirpath));
    fs.writeFile(
      `${dirpath}/packages.list`,
      option.denylist.map((v) => `Package: ${v}`).join("\n") + "\n\n"
    );
    if (option.skip) {
      terminal.sendText(
        [
          " ll-builder",
          "build",
          "--skip-commit-output",
          "--skip-fetch-source",
          "--",
          "sh",
          "-c",
          `"cat /packages.list /runtime/packages.list >> ${dirpath}/packages.list"`,
        ].join(" ")
      );
    }
    terminal.sendText(
      [
        " " + ext.extensionPath + "/out/tools-" + process.arch,
        document.fileName,
        dirpath + "/packages.list",
      ].join(" ")
    );
    terminal.sendText(
      " bash -c 'rm linglong/sources/*.deb 2>/dev/null || true'"
    );
    terminal.show();
  }
}

// deb source转buildext
export async function debsource2buildext(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const document = editor.document;
  const text = document.getText();
  const lines = text.split("\n");
  const pkgs = new Array<string>();
  lines.forEach((line) => {
    line = line.trimStart();
    if (!line.startsWith("# linglong:gen_deb_source install")) {
      return;
    }
    line
      .slice("# linglong:gen_deb_source install".length)
      .split(",")
      .map((pkg) => pkgs.push(pkg));
  });
  pkgs.sort();
  await editor.edit((editBuilder) => {
    editBuilder.insert(
      editor.selection.active,
      [
        "buildext:",
        " apt:",
        "  build_depends:",
        ...pkgs.map((pkg) => "    - " + pkg),
      ].join("\n")
    );
  });
}

// 生成dsc source
export async function gen_dsc_source(context: vscode.ExtensionContext) {
  console.log("run gen_dsc_source");
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
          components="${components.join(" ")}"
          
          tmpdir=$(mktemp -d)
          cd "$tmpdir"
          # 下载Sources文件
          for component in $components;do
              curl -Ls "$url/dists/$distribution/$component/source/Sources.gz" | gunzip >> Sources
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
  terminal.sendText(`echo "">> ${document.fileName}`);
  terminal.show();
}

// 清理
export async function buildClean() {
  if (!vscode.workspace.workspaceFolders) {
    return;
  }
  // 获取当前文件路径
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      "未找到当前活动的编辑器，无法获取当前文件。"
    );
    return;
  }
  const document = editor.document;
  const currentFilePath = document.uri.fsPath;
  if (!currentFilePath.endsWith("linglong.yaml")) {
    return;
  }
  // 读取yaml文件
  // 读取当前yaml文件
  let yamlContent: string;
  try {
    yamlContent = await fs.readFile(currentFilePath, "utf-8");
  } catch (err) {
    vscode.window.showErrorMessage("读取yaml文件失败: " + err);
    return;
  }
  const project = yaml.parse(yamlContent);
  const id = project.package.id;
  const terminal = vscode.window.createTerminal(`Ext Terminal`);
  terminal.sendText(` rm -rf linglong`);
  terminal.sendText(` ll-builder list | grep ${id} | xargs ll-builder remove`);
  terminal.show();
}
