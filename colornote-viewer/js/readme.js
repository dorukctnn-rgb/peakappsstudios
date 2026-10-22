/* Notelift: the read-me files inside the iPhone and Google Docs packs, in the five page languages. Only the worker
 * loads this file, when it makes a pack. */
export const README = {
  en: {
    readmeIphone: `Notelift: your ColorNote notes, ready for Apple Notes

What is in this folder
- "ColorNote notes.enex": every note in one file (Evernote's format), with the date each note was made and last changed.
- "Markdown notes": one file per note, in a folder for each ColorNote folder; archived notes are in "Archive". The first line of each file is the note's title, and the last line lists its colour, folder and dates.
Notes in the trash are left out.

On a Mac (the notes then reach your iPhone through iCloud)
1. Unzip this file.
2. Open Notes on the Mac and click a folder in your iCloud account.
3. Choose File > Import to Notes, select "ColorNote notes.enex" and click Import.
   To keep your ColorNote folders instead: choose File > Import to Notes, select the "Markdown notes" folder, click Options, turn on "Preserve folder structure on import" and click Import.
4. The notes appear in a folder called Imported Notes. Move or rename it as you like.
5. On your iPhone, open Notes. With iCloud turned on for Notes, the imported notes are there.

Only an iPhone, no Mac
Notes on iPhone cannot import files. Save this ZIP to the Files app, where you can open and read every note (.md files are plain text), and copy the notes you need into Notes. If you can use any Mac signed in to your Apple Account, steps 1 to 5 move them all at once.

What does not carry over
- Colours: Apple Notes has no note colours. Each note's colour is written in its last line.
- Reminders: they are written in each note's last line; set the ones you still need in Reminders.
- Locked notes: their text stays locked in ColorNote, so only their titles are here. Take the lock off in ColorNote first and make a new backup.

The steps follow Apple's guide "Import, export, and print notes on Mac" (support.apple.com), checked in October 2026.`,
    readmeGdocs: `Notelift: your ColorNote notes, ready for Google Docs and Google Drive

What is in this folder
- "All notes in one file.html": every note under its own heading, with its colour, folder and dates.
- "Google Docs, one per note": one .html file per note, in a folder for each ColorNote folder; archived notes are in "Archive".
Notes in the trash are left out.

Every note in one Google Doc
1. Unzip this file.
2. Go to drive.google.com, choose New > File upload and pick "All notes in one file.html".
3. Right-click the uploaded file and choose Open with > Google Docs. Docs makes an editable copy, with each note as a heading you can jump to.

One Google Doc per note
1. In Google Drive, open Settings (the gear icon) and, under Uploads, tick "Convert uploads", which turns uploaded files into Google Docs.
2. Choose New > Folder upload and pick the folder "Google Docs, one per note". Each note becomes its own document, in folders like the ones you had in ColorNote.
3. Untick "Convert uploads" again afterwards if you prefer.

What does not carry over
- Checklists become lists with an empty or a ticked box in front of each item; Google Docs does not turn them into its own checkboxes.
- Colours and reminders are written in each note's details line.
- Google Keep has no way to import files, so these steps are for Google Docs and Drive.
- Locked notes: only their titles are here. Take the lock off in ColorNote and make a new backup to include their text.`,
  },
  ja: {
    readmeIphone: `Notelift: Apple のメモ用に整えた ColorNote のメモ

このフォルダの中身
- 「ColorNote のメモ.enex」: すべてのメモを1つにまとめたファイル（Evernote の形式）。各メモの作成日時と更新日時が入っています。
- 「Markdown のメモ」: 1メモ1ファイルで、ColorNote のフォルダごとに分かれています。アーカイブのメモは「アーカイブ」にあります。各ファイルの1行目がメモのタイトル、最後の行に色、フォルダ、日時が書かれています。
ゴミ箱のメモは入れていません。

Mac を使う場合（取り込んだメモは iCloud で iPhone にも届きます）
1. この ZIP を解凍します。
2. Mac で「メモ」を開き、iCloud アカウントのフォルダをクリックします。
3. 「ファイル」>「“メモ”に読み込む」を選び、「ColorNote のメモ.enex」を選択して「読み込む」をクリックします。
   ColorNote のフォルダ分けを残したい場合は、「ファイル」>「“メモ”に読み込む」で「Markdown のメモ」フォルダを選び、「読み込み時にフォルダ構造を保持」をオンにして（見えないときは「オプション」をクリック）「読み込む」をクリックします。
4. メモは「読み込まれたメモ」というフォルダに入ります。移動や名前の変更は自由です。
5. iPhone で「メモ」を開きます。メモの iCloud がオンなら、取り込んだメモが表示されます。

iPhone だけで Mac がない場合
iPhone の「メモ」はファイルを読み込めません。この ZIP を「ファイル」アプリに保存すれば、すべてのメモを開いて読めます（.md はふつうのテキストです）。必要なメモをコピーして「メモ」に貼り付けてください。自分の Apple アカウントでサインインできる Mac があれば、上の 1〜5 でまとめて移せます。

引き継がれないもの
- 色: Apple のメモにはメモの色がありません。各メモの色は最後の行に書いてあります。
- リマインダー: 各メモの最後の行に書いてあります。まだ必要なものは「リマインダー」で設定し直してください。
- ロックされたメモ: 本文は ColorNote でロックされたままなので、ここにはタイトルだけが入っています。先に ColorNote でロックを解除し、バックアップを作り直してください。

手順は Apple のガイド「Macでメモを読み込む/書き出す/プリントする」(support.apple.com) に沿っています（2026年10月確認）。`,
    readmeGdocs: `Notelift: Google ドキュメントと Google ドライブ用に整えた ColorNote のメモ

このフォルダの中身
- 「すべてのメモ（1ファイル）.html」: すべてのメモを見出しごとに並べ、色、フォルダ、日時を添えたファイル。
- 「Google ドキュメント（1メモ1ファイル）」: 1メモ1つの .html ファイルで、ColorNote のフォルダごとに分かれています。アーカイブのメモは「アーカイブ」にあります。
ゴミ箱のメモは入れていません。

すべてのメモを1つの Google ドキュメントに
1. この ZIP を解凍します。
2. drive.google.com を開き、「新規」>「ファイルのアップロード」で「すべてのメモ（1ファイル）.html」を選びます。
3. アップロードしたファイルを右クリックし、「アプリで開く」>「Google ドキュメント」を選びます。編集できるコピーが作られ、各メモが見出しになるので目次から移動できます。

1メモ1つの Google ドキュメントに
1. Google ドライブの「設定」（歯車アイコン）を開き、「アップロード」の項目にある、アップロードしたファイルを Google ドキュメントの形式に変換する設定にチェックを入れます。
2. 「新規」>「フォルダのアップロード」で「Google ドキュメント（1メモ1ファイル）」フォルダを選びます。ColorNote と同じフォルダ分けで、メモごとにドキュメントができます。
3. 終わったら、必要に応じてこのチェックを外してください。

引き継がれないもの
- チェックリストは、各項目の前に空の四角かチェック付きの四角が付いた箇条書きになります。Google ドキュメントのチェックボックスにはなりません。
- 色とリマインダーは、各メモの詳細の行に書いてあります。
- Google Keep にはファイルを読み込む機能がないため、この手順は Google ドキュメントとドライブ向けです。
- ロックされたメモはタイトルだけです。本文も入れるには、ColorNote でロックを解除してバックアップを作り直してください。`,
  },
  ko: {
    readmeIphone: `Notelift: 아이폰 메모 앱용으로 정리한 컬러노트 메모

이 폴더에 들어 있는 것
- "컬러노트 메모.enex": 모든 메모를 한 파일에 담은 것(Evernote 형식). 메모마다 작성일시와 수정일시가 들어 있습니다.
- "마크다운 메모": 메모마다 파일 하나씩, 컬러노트 폴더별로 나뉘어 있습니다. 보관함의 메모는 "보관함" 폴더에 있습니다. 각 파일의 첫 줄은 메모 제목이고, 마지막 줄에 색, 폴더, 날짜가 적혀 있습니다.
휴지통의 메모는 넣지 않았습니다.

Mac이 있을 때 (가져온 메모는 iCloud로 아이폰에도 옵니다)
1. 이 ZIP 파일의 압축을 풉니다.
2. Mac에서 메모 앱을 열고 iCloud 계정의 폴더를 클릭합니다.
3. 파일 > 메모 앱으로 가져오기를 고르고 "컬러노트 메모.enex"를 선택한 뒤 가져오기를 클릭합니다.
   컬러노트 폴더 구성을 살리고 싶다면 파일 > 메모 앱으로 가져오기에서 "마크다운 메모" 폴더를 선택하고, "가져올 때 폴더 구조 유지"를 켠 뒤(보이지 않으면 옵션 클릭) 가져오기를 클릭합니다.
4. 메모는 "가져온 메모" 폴더에 들어갑니다. 원하는 대로 옮기거나 이름을 바꾸세요.
5. 아이폰에서 메모 앱을 엽니다. 메모의 iCloud가 켜져 있으면 가져온 메모가 보입니다.

아이폰만 있고 Mac이 없을 때
아이폰의 메모 앱은 파일을 가져올 수 없습니다. 이 ZIP을 파일 앱에 저장하면 모든 메모를 열어서 읽을 수 있습니다(.md는 일반 텍스트입니다). 필요한 메모를 복사해서 메모 앱에 붙여 넣으세요. 내 Apple 계정으로 로그인할 수 있는 Mac이 있다면 위의 1~5단계로 한 번에 옮길 수 있습니다.

옮겨지지 않는 것
- 색: 아이폰 메모에는 메모 색이 없습니다. 메모마다 마지막 줄에 색을 적어 두었습니다.
- 알림: 메모마다 마지막 줄에 적어 두었습니다. 아직 필요한 알림은 미리 알림 앱에서 다시 설정하세요.
- 잠긴 메모: 본문이 컬러노트에서 잠긴 채로 있어서 여기에는 제목만 있습니다. 먼저 컬러노트에서 잠금을 풀고 백업을 다시 만드세요.

이 순서는 Apple 안내 "Mac에서 메모 가져오기, 내보내기 및 프린트하기"(support.apple.com)를 따랐습니다(2026년 10월 확인).`,
    readmeGdocs: `Notelift: 구글 문서와 구글 드라이브용으로 정리한 컬러노트 메모

이 폴더에 들어 있는 것
- "모든 메모 (한 파일).html": 모든 메모를 제목별로 나누고 색, 폴더, 날짜를 함께 적은 파일.
- "구글 문서 (메모마다 하나)": 메모마다 .html 파일 하나씩, 컬러노트 폴더별로 나뉘어 있습니다. 보관함의 메모는 "보관함" 폴더에 있습니다.
휴지통의 메모는 넣지 않았습니다.

모든 메모를 구글 문서 하나로
1. 이 ZIP 파일의 압축을 풉니다.
2. drive.google.com에서 새로 만들기 > 파일 업로드를 고르고 "모든 메모 (한 파일).html"을 선택합니다.
3. 업로드한 파일을 마우스 오른쪽 버튼으로 클릭하고 연결 앱 > Google 문서를 고릅니다. 편집할 수 있는 사본이 생기고, 메모마다 제목이 붙어 있어 바로 이동할 수 있습니다.

메모마다 구글 문서 하나씩
1. 구글 드라이브의 설정(톱니바퀴 아이콘)을 열고, 업로드 항목에서 업로드한 파일을 구글 문서 형식으로 변환하는 설정을 체크합니다.
2. 새로 만들기 > 폴더 업로드를 고르고 "구글 문서 (메모마다 하나)" 폴더를 선택합니다. 컬러노트와 같은 폴더 구성으로 메모마다 문서가 하나씩 생깁니다.
3. 다 끝나면 원할 경우 체크를 다시 해제하세요.

옮겨지지 않는 것
- 체크리스트는 항목마다 빈 상자나 체크된 상자가 붙은 목록이 됩니다. 구글 문서의 체크박스로 바뀌지는 않습니다.
- 색과 알림은 메모마다 정보 줄에 적어 두었습니다.
- Google Keep에는 파일을 가져오는 기능이 없어서, 이 순서는 구글 문서와 드라이브용입니다.
- 잠긴 메모는 제목만 있습니다. 본문까지 넣으려면 컬러노트에서 잠금을 풀고 백업을 다시 만드세요.`,
  },
  es: {
    readmeIphone: `Notelift: tus notas de ColorNote, listas para Notas de Apple

Qué hay en esta carpeta
- "Notas de ColorNote.enex": todas las notas en un archivo (formato de Evernote), con la fecha en que se creó y se modificó cada una.
- "Notas en Markdown": un archivo por nota, en una carpeta por cada carpeta de ColorNote; las notas archivadas están en "Archivo". La primera línea de cada archivo es el título de la nota y la última dice su color, carpeta y fechas.
Las notas de la papelera no están incluidas.

En un Mac (después las notas llegan al iPhone por iCloud)
1. Descomprime este archivo.
2. Abre Notas en el Mac y haz clic en una carpeta de tu cuenta de iCloud.
3. Elige Archivo > Importar a Notas, selecciona "Notas de ColorNote.enex" y haz clic en Importar.
   Si prefieres conservar tus carpetas de ColorNote: elige Archivo > Importar a Notas, selecciona la carpeta "Notas en Markdown", activa la opción de mantener la estructura de la carpeta en la importación (si no la ves, haz clic en Opciones) y haz clic en Importar.
4. Las notas aparecen en una carpeta llamada Notas importadas. Muévela o cámbiale el nombre como quieras.
5. En el iPhone, abre Notas. Con iCloud activado para Notas, ahí están las notas importadas.

Solo con iPhone, sin Mac
Notas en el iPhone no puede importar archivos. Guarda este ZIP en la app Archivos, donde puedes abrir y leer todas las notas (los .md son texto normal), y copia en Notas las que necesites. Si puedes usar cualquier Mac con tu cuenta de Apple, los pasos 1 a 5 las pasan todas de una vez.

Lo que no se pasa
- Colores: Notas de Apple no tiene colores de nota. El color de cada nota está escrito en su última línea.
- Recordatorios: están escritos en la última línea de cada nota; vuelve a crear en Recordatorios los que aún necesites.
- Notas bloqueadas: su texto sigue bloqueado en ColorNote, así que aquí solo está el título. Desbloquéalas antes en ColorNote y haz una copia nueva.

Los pasos siguen la guía de Apple "Importar, exportar e imprimir notas en el Mac" (support.apple.com), revisada en octubre de 2026.`,
    readmeGdocs: `Notelift: tus notas de ColorNote, listas para Google Docs y Google Drive

Qué hay en esta carpeta
- "Todas las notas en un archivo.html": cada nota bajo su propio título, con su color, carpeta y fechas.
- "Google Docs, uno por nota": un archivo .html por nota, en una carpeta por cada carpeta de ColorNote; las archivadas están en "Archivo".
Las notas de la papelera no están incluidas.

Todas las notas en un solo documento de Google
1. Descomprime este archivo.
2. Entra en drive.google.com, elige Nuevo > Subir archivo y escoge "Todas las notas en un archivo.html".
3. Haz clic derecho en el archivo subido y elige Abrir con > Documentos de Google. Docs crea una copia editable en la que cada nota es un título al que puedes saltar.

Un documento de Google por nota
1. En Google Drive, abre Configuración (el icono del engranaje) y, en la parte de subidas, marca la opción que convierte los archivos subidos al formato de Documentos de Google.
2. Elige Nuevo > Subir carpeta y escoge la carpeta "Google Docs, uno por nota". Cada nota se convierte en su propio documento, en carpetas como las que tenías en ColorNote.
3. Después, si quieres, vuelve a desmarcar la opción.

Lo que no se pasa
- Las listas de tareas quedan como listas con una casilla vacía o marcada delante de cada elemento; Google Docs no las convierte en sus propias casillas.
- Los colores y recordatorios están escritos en la línea de datos de cada nota.
- Google Keep no puede importar archivos, así que estos pasos son para Google Docs y Drive.
- Notas bloqueadas: aquí solo está su título. Desbloquéalas en ColorNote y haz una copia nueva para incluir el texto.`,
  },
  pt: {
    readmeIphone: `Notelift: suas notas do ColorNote, prontas para o app Notas da Apple

O que tem nesta pasta
- "Notas do ColorNote.enex": todas as notas em um arquivo (formato do Evernote), com a data em que cada nota foi criada e alterada.
- "Notas em Markdown": um arquivo por nota, numa pasta para cada pasta do ColorNote; as notas arquivadas estão em "Arquivo". A primeira linha de cada arquivo é o título da nota e a última traz a cor, a pasta e as datas.
As notas da lixeira ficaram de fora.

Num Mac (depois as notas chegam ao iPhone pelo iCloud)
1. Descompacte este arquivo.
2. Abra o Notas no Mac e clique numa pasta da sua conta do iCloud.
3. Escolha Arquivo > Importar para o app Notas, selecione "Notas do ColorNote.enex" e clique em Importar.
   Para manter as pastas do ColorNote: escolha Arquivo > Importar para o app Notas, selecione a pasta "Notas em Markdown", ative "Preservar a estrutura da pasta ao importar" (se não aparecer, clique em Opções) e clique em Importar.
4. As notas aparecem numa pasta chamada Notas Importadas. Mova ou renomeie como quiser.
5. No iPhone, abra o Notas. Com o iCloud ativado para o Notas, as notas importadas estão lá.

Só com iPhone, sem Mac
O Notas do iPhone não importa arquivos. Salve este ZIP no app Arquivos, onde dá para abrir e ler todas as notas (os .md são texto comum), e copie para o Notas as que você precisar. Se puder usar qualquer Mac com a sua Conta Apple, os passos 1 a 5 passam todas de uma vez.

O que não passa
- Cores: o Notas da Apple não tem cor de nota. A cor de cada nota está escrita na última linha.
- Lembretes: estão escritos na última linha de cada nota; crie de novo no app Lembretes os que ainda precisar.
- Notas bloqueadas: o texto continua bloqueado no ColorNote, então aqui só está o título. Desbloqueie antes no ColorNote e faça um novo backup.

Os passos seguem o guia da Apple "Importar, exportar e imprimir notas no Mac" (support.apple.com), conferido em outubro de 2026.`,
    readmeGdocs: `Notelift: suas notas do ColorNote, prontas para o Google Docs e o Google Drive

O que tem nesta pasta
- "Todas as notas em um arquivo.html": cada nota com o seu próprio título, com cor, pasta e datas.
- "Google Docs, um por nota": um arquivo .html por nota, numa pasta para cada pasta do ColorNote; as arquivadas estão em "Arquivo".
As notas da lixeira ficaram de fora.

Todas as notas num só documento do Google
1. Descompacte este arquivo.
2. Entre em drive.google.com, escolha Novo > Upload de arquivo e selecione "Todas as notas em um arquivo.html".
3. Clique com o botão direito no arquivo enviado e escolha Abrir com > Documentos Google. O Docs cria uma cópia editável em que cada nota é um título para onde você pode pular.

Um documento do Google por nota
1. No Google Drive, abra Configurações (o ícone de engrenagem) e, na parte de uploads, marque a opção que converte os arquivos enviados para o formato dos Documentos Google.
2. Escolha Novo > Upload de pasta e selecione a pasta "Google Docs, um por nota". Cada nota vira um documento próprio, em pastas como as que você tinha no ColorNote.
3. Depois, se preferir, desmarque a opção de novo.

O que não passa
- As listas de tarefas viram listas com uma caixa vazia ou marcada antes de cada item; o Google Docs não as transforma nas caixas de seleção dele.
- Cores e lembretes estão escritos na linha de dados de cada nota.
- O Google Keep não importa arquivos, então estes passos são para o Google Docs e o Drive.
- Notas bloqueadas: aqui só está o título. Desbloqueie no ColorNote e faça um novo backup para incluir o texto.`,
  },
};
export const readme = lang => README[lang] || README.en;
