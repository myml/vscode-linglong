# vscode 玲珑插件

辅助编写玲珑 linglong.yaml 文件

## 玲珑是什么

玲珑是一种新型的独立包管理工具集，致力于治理 Linux 系统下传统软件包格式复杂、交叉的依赖关系导致的各种兼容性问题，以及过于松散的权限管控导致的安全风险。

玲珑的官方网站是 https://linglong.dev

## 代码提示和校验

使用 schemas 实现 linglong.yaml 文件的代码提示和必填字段校验

![image](./image.png)

## 依赖更新

在制作玲珑包时，如果 base 和 runtime 中缺少构建应用所需依赖，需要自己添加 deb 包，deb 包的依赖繁多，软件更新后下载地址又会失效，插件提供了一种自动更新 deb 包 依赖的功能。

### 第一步

~~需要安装 aptly 这个命令行工具，下载地址 https://www.aptly.info/download/ 。~~

从插件 0.1.0 版本开始内嵌命令行工具，不再需要安装 aptly

### 第二步

将 sources 字段放在 linglong.yaml 的最后，在 sources 最后添加以上注释(将 libical-dev, wget 替换称你自己想安装的软件包)

```yaml
build: |
  ...
sources:
  - kind: git
    url: https://github.com/linuxdeepin/dde-calendar
    commit: 5.13.1
  # linglong:gen_deb_source sources arm64 https://pools.uniontech.com/deepin-beige beige main community
  # linglong:gen_deb_source install libical-dev, wget
```

第一个注释是用于设置软件源，只能写一次，第二个注释是用于安装依赖，可以写多次（多个 install 中间可添加其他内容，便于注释每个依赖的作用），例如`libical-dev, wget`可以分开写：

```
# 构建需要
# linglong:gen_deb_source install libical-dev
# 用于更新节假日
# linglong:gen_deb_source install wget
```

添加这两行注释后，在 vscode 中按 `Ctrl+Shift+P` 搜索 `linglong: Gen deb sources`命令, 等待一段时间后，插件会自动将填写的依赖和其依赖树全部添加到当前 linglong.yaml 文件末尾。

之后依赖有更新可重复执行 `linglong: Gen deb sources` 命令来更新软件包，安装本插件后在 linglong.yaml 输入 ll(两个小写的 L,非数字 1), 可自动生成注释内容

### 第三步

`linglong: Gen deb sources` 命令还会下载一个 `install_dep`脚本到工作目录，在 linglong.yaml 的 `build`字段添加 `bash ./install_dep linglong/sources "$PREFIX"`用来在构建玲珑包时安装 deb 包

```yaml
build: |
  bash ./install_dep linglong/sources $PREFIX
  xxx
```

## dsc 更新

在制作玲珑包时，可能需要从 deb 仓库下载源码用于构建，玲珑提供了 dsc source 功能，例如在 linglong.yaml 中添加以下 source，玲珑在构建时会使用 dget 下载源码

```
  - kind: dsc
    name: qtsvg-opensource-src
    url: https://pools.uniontech.com/deepin-beige/pool/main/q/qtsvg-opensource-src/qtsvg-opensource-src_5.15.8-1+dde.dsc
    digest: b10b9e502c65145f7b54b691ce8ffc62400abd05898f37a803bc9af76ea55508
```

但是 dsc 同 deb 一样下载容易失效，插件提供了自动更新 dsc source 的功能

请在 sources 添加一下注释，注意 gen_dsc_source 的注释要添加到 gen_deb_source 的前面，避免被覆盖

```
  # linglong:gen_dsc_source sources https://pools.uniontech.com/deepin-beige beige main
  # linglong:gen_dsc_source install qtsvg-opensource-src
```

添加这两行注释后，在 vscode 中按 `Ctrl+Shift+P` 搜索 `linglong: Gen dsc sources`命令, 等待一段时间后，插件会自动在仓库中寻找包名对应的 dsc 文件，将 dsc 文件和哈希值添加到 linglong.yaml。

## 快捷命令

除了 `linglong: Gen deb sources`，还添加了以下几个快捷命令，可按 `Ctrl+Shift+P` 搜索命令，并给命令设置你喜欢用的快捷键。

linglong: Build
`ll-builder build`
linglong: Run
`ll-builder run`
linglong: Export
`ll-builder export`
linglong: Offline Build
`ll-builder build --offline`

## FAQ

为什么按 `Ctrl+Shift+P` 无法搜索到相关命令

首先要确保当前 vscode 安装了本插件，其次要确定当前编辑器正打开着 linglong.yaml 文件
