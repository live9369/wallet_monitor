# dbex.js 数据库清理工具使用说明

`dbex.js` 是一个数据库清理工具，用于清理数据库中的异常数据和管理地址树。

## 基本用法

```bash
node src/ac/dbex.js [命令] [参数] [选项]
```

## 可用命令

### 1. 列出所有钱包

获取数据库中所有钱包的详细信息，支持按层级过滤。

```bash
# 列出所有钱包
node src/ac/dbex.js list

# 或使用简写
node src/ac/dbex.js ls

# 指定前缀
node src/ac/dbex.js --prefix=wallet: list

# 按层级过滤（只显示层级1-3的钱包）
node src/ac/dbex.js list --min-level=1 --max-level=3

# 只显示顶级钱包（层级1）
node src/ac/dbex.js list --min-level=1 --max-level=1

# 只显示深层钱包（层级>=5）
node src/ac/dbex.js list --min-level=5
```

**输出示例：**
```
📋 获取所有钱包列表
前缀: new_wallet:
================================================================================
✅ Redis连接成功
📋 正在获取所有钱包...
📊 找到 100 个钱包地址

📋 钱包详细信息 (共 100 个):
================================================================================
📍 层级 1 (共 10 个):
  • MainWallet1 (0x1234...) [顶级]
  • MainWallet2 (0x5678...) [顶级]
...

📍 层级 2 (共 30 个):
  • Child1 (0xabcd...)
    上级: MainWallet1 (0x1234...)
  • Child2 (0xefgh...)
    上级: MainWallet1 (0x1234...)
...

================================================================================
📊 统计信息:
总钱包数: 100
顶级节点: 10 个
各层级分布:
  层级 1: 10 个 (10.00%)
  层级 2: 30 个 (30.00%)
  层级 3: 40 个 (40.00%)
  层级 4: 20 个 (20.00%)
最大层级: 4
```

### 2. 清理孤点数据（默认命令）

清理所有非顶级的孤点数据（refer 指向的节点不存在的节点）。

```bash
# 默认前缀 (new_wallet:)，实际删除
node src/ac/dbex.js

# 指定前缀
node src/ac/dbex.js --prefix=wallet:

# 试运行模式（只查看不删除）
node src/ac/dbex.js --dry-run
# 或
node src/ac/dbex.js -d

# 组合使用
node src/ac/dbex.js --prefix=wallet: --dry-run
```

**输出示例：**
```
📊 数据库清理工具
前缀: new_wallet:
模式: 删除模式
================================================================================

📊 统计信息:
总节点数: 1000
顶级节点: 50
有效节点: 900
孤点节点: 50 (5.00%)

================================================================================
🔍 开始查找孤点数据...
📊 总共有 1000 个钱包地址
🔴 发现孤点: Unknown (0x1234...) -> refer: 0x5678... (不存在)
...
📋 找到 50 个孤点节点

🗑️ 开始删除 50 个孤点节点...
🗑️ 删除进度: 10/50 - Unknown
...
✅ 删除完成:
   成功: 50 个
   失败: 0 个
```

### 3. 删除指定地址及其所有子集

递归删除指定地址及其所有子集（包括子集的子集）。

```bash
# 删除指定地址及其所有子集
node src/ac/dbex.js remove 0x1234...

# 使用 del 命令（等效）
node src/ac/dbex.js del 0x1234...

# 指定前缀
node src/ac/dbex.js --prefix=wallet: remove 0x1234...

# 试运行模式（先查看将要删除的内容）
node src/ac/dbex.js remove 0x1234... --dry-run

# 组合使用
node src/ac/dbex.js --prefix=new_wallet: remove 0x1234... -d
```

**输出示例：**

试运行模式：
```
🗑️ 删除地址及其所有子集
前缀: new_wallet:
地址: 0x1234...
模式: 试运行（不会实际删除）
================================================================================

🗑️ 开始删除钱包: 0x1234...
名称: MainWallet
层级: 2
上级: 0x5678...

🔍 正在查找所有子集地址...
📊 找到 25 个子集地址
📋 准备删除 26 个地址（包括主地址）

🔍 试运行模式：以下节点将被删除（但实际不会删除）:
1. MainWallet (0x1234...) - 层级 2 [主地址]
2. Child1 (0xabcd...) - 层级 3
3. Child2 (0xefgh...) - 层级 3
...
```

实际删除模式：
```
🗑️ 删除地址及其所有子集
前缀: new_wallet:
地址: 0x1234...
模式: 删除模式
================================================================================

🗑️ 开始删除钱包: 0x1234...
名称: MainWallet
层级: 2
上级: 0x5678...

🔍 正在查找所有子集地址...
📊 找到 25 个子集地址
📋 准备删除 26 个地址（包括主地址）

🚀 开始删除 26 个地址...
🗑️ 删除进度: 10/26 - Child1
🗑️ 删除进度: 20/26 - Child2
🗑️ 删除进度: 26/26 - MainWallet

✅ 删除完成: 成功删除钱包 0x1234... 及其 25 个子集（共 26 个）
   成功: 26 个
   失败: 0 个

📊 各层级删除统计:
   层级 3: 20 个
   层级 2: 6 个（包括主地址）
```

## 参数说明

### 命令参数

- `list` 或 `ls` - 列出所有钱包
  - 格式: `list [选项]`
  - 示例: `list --min-level=1 --max-level=3`

- `remove` 或 `del` - 删除指定地址及其所有子集
  - 格式: `remove <钱包地址>`
  - 示例: `remove 0x1234567890abcdef1234567890abcdef12345678`

### 选项参数

- `--prefix=<前缀>` - 指定数据库前缀
  - 默认: `new_wallet:`
  - 常用前缀:
    - `new_wallet:` - 新钱包数据库
    - `wallet:` - 钱包数据库
    - `my_wallet:` - 我的钱包数据库
    - `pga_wallet:` - PGA钱包数据库

- `--min-level=<层级>` - 只显示指定层级以上的钱包（仅用于 list 命令）
  - 示例: `--min-level=1` - 只显示层级 >= 1 的钱包

- `--max-level=<层级>` - 只显示指定层级以下的钱包（仅用于 list 命令）
  - 示例: `--max-level=3` - 只显示层级 <= 3 的钱包

- `--dry-run` 或 `-d` - 试运行模式（仅用于 remove 命令）
  - 只查找和显示将要删除的内容，不实际删除
  - 用于预览操作结果，避免误删

## 使用场景

### 场景1: 查看所有钱包

查看数据库中所有钱包的详细信息：

```bash
# 查看所有钱包
node src/ac/dbex.js --prefix=new_wallet: list

# 只查看顶级钱包（层级1）
node src/ac/dbex.js --prefix=new_wallet: list --min-level=1 --max-level=1

# 查看深层钱包（层级>=5）
node src/ac/dbex.js --prefix=new_wallet: list --min-level=5
```

### 场景2: 清理孤点数据

定期清理数据库中的孤点数据，保持数据一致性：

```bash
# 先试运行查看
node src/ac/dbex.js --prefix=new_wallet: --dry-run

# 确认无误后实际删除
node src/ac/dbex.js --prefix=new_wallet:
```

### 场景3: 删除复杂的地址树

删除一个地址及其所有子集（用于清理不需要的监控分支）：

```bash
# 1. 先查看将要删除的内容
node src/ac/dbex.js --prefix=new_wallet: remove 0x1234... --dry-run

# 2. 确认子集数量无误后，实际删除
node src/ac/dbex.js --prefix=new_wallet: remove 0x1234...
```

### 场景4: 批量清理多个地址树

可以结合脚本使用：

```bash
#!/bin/bash
# cleanup.sh

PREFIX="new_wallet:"
ADDRESSES=(
    "0x1234567890abcdef1234567890abcdef12345678"
    "0xabcdef1234567890abcdef1234567890abcdef12"
    "0x567890abcdef1234567890abcdef1234567890ab"
)

for addr in "${ADDRESSES[@]}"; do
    echo "处理地址: $addr"
    node src/ac/dbex.js --prefix=$PREFIX remove $addr
    echo "---"
done
```

## 注意事项

1. **备份数据**: 删除操作不可逆，建议在删除前备份数据
   ```bash
   # 使用 exe.js 导出数据
   node src/exe.js export backup.json
   ```

2. **试运行优先**: 在执行实际删除前，总是先使用 `--dry-run` 查看将要删除的内容

3. **前缀选择**: 确保使用正确的前缀，避免误删其他数据库的数据

4. **地址格式**: 钱包地址必须是有效的以太坊地址格式（42字符，以0x开头）

5. **权限检查**: 确保有足够的权限访问 Redis 数据库

## 错误处理

如果遇到错误，工具会显示详细的错误信息：

```bash
❌ 地址不存在: 0x1234...
❌ 删除钱包失败: Connection refused
❌ 执行失败: ...
```

常见错误：
- `地址不存在` - 指定的地址不在数据库中
- `Connection refused` - 无法连接到 Redis
- `权限不足` - 没有删除权限

## 输出说明

### 统计信息
- **总节点数**: 数据库中所有节点总数
- **顶级节点**: refer 为空或空的节点（层级1）
- **有效节点**: 有有效的 refer 关系的节点
- **孤点节点**: refer 指向不存在的节点（非顶级）

### 删除统计
- **成功数量**: 成功删除的节点数
- **失败数量**: 删除失败的节点数
- **层级统计**: 各层级删除的节点数量

## 完整示例

```bash
# 示例1: 列出所有钱包
node src/ac/dbex.js --prefix=new_wallet: list

# 示例2: 只显示层级1的顶级钱包
node src/ac/dbex.js --prefix=new_wallet: list --min-level=1 --max-level=1

# 示例3: 清理 new_wallet: 前缀的孤点数据（试运行）
node src/ac/dbex.js --prefix=new_wallet: --dry-run

# 示例4: 删除 wallet: 前缀下的指定地址及其所有子集
node src/ac/dbex.js --prefix=wallet: remove 0x1234...

# 示例5: 删除 my_wallet: 前缀下的地址（先试运行）
node src/ac/dbex.js --prefix=my_wallet: remove 0x5678... -d
```

## 与其他工具配合

```bash
# 1. 先导出数据备份
node src/exe.js export backup.json

# 2. 查看要删除的内容（试运行）
node src/ac/dbex.js remove 0x1234... --dry-run

# 3. 确认后执行删除
node src/ac/dbex.js remove 0x1234...

# 4. 验证删除结果（查询子集）
node src/exe.js query 0x1234...
```
